'use strict';

const Crypto = require('crypto');

const _ = require('lodash');
const validator = require('is-my-json-valid');

const Context = require('./context');
const Password = require('./password');

const tokenValidator = validator({
  type: 'object',
  required: ['grant_type', 'username', 'password'],
  properties: {
    grant_type: {
      type: 'string',
      enum: ['password']
    },
    username: {
      type: 'string'
    },
    password: {
      type: 'string'
    }
  }
});

class Authentication {
  constructor(app, storage, options) {
    this.app = app;
    this.storage = storage;
    this.options = _.defaults(options, {
      userFields: ['id'],
      userModel: 'User',
      usernameField: 'username',
      passwordField: 'password',
      password: {},
      admins: {}
    });
    this.password = new Password(this.options.password);

    app.authentication(request => {
      let context = new Context();
      let promise;
      const authnHeader = typeof request.headers.authorization === 'string' ? request.headers.authorization : '';

      // Check Basic auth - used for admin tokens.
      let parts = authnHeader.match(/^Basic (.+)$/);
      if (parts) {
        parts = new Buffer(parts[1], 'base64').toString().split(':');
        const username = parts[0];
        const password = parts[1];
        if (this.options.admins[username] !== 'undefined' && this.password.isValid(this.options.admins[username], password)) {
          // Authenticated as admin user.
          // Allow execution of context-free queries.
          context = undefined;
        }
      }

      // Check Bearer token.
      parts = authnHeader.match(/^Bearer (.+)$/);
      if (parts) {
        const fields = this.options.userFields.join(' ');
        const query = '{token:listAuthnToken(token:?){user{' + fields + '}}}';
        const args = [parts[1]];
        promise = storage.query(query, args).then(result => {
          if (result.token.length === 0) {
            throw new Error('Invalid access token');
          }
          context.setUser(result.token[0].user);
        });
      }
      return Promise.resolve(promise).then(() => {
        request.setParameter('context', context);
      });
    });

    app.postvalidation('POST /token', request => {
      if (!tokenValidator(request.body)) {
        throw new Error(tokenValidator.error);
      }
    });
    app.process('POST /token', request => {
      let token;
      if (request.body.grant_type === 'password') {
        const query = `{
          user: list${this.options.userModel} (${this.options.usernameField}: ?) {
            id
            password: ${this.options.passwordField}
          }
        }`;
        const args = [request.body.username];
        return this.storage.query(query, args).then(result => {
          const valid = result.user.length > 0 && this.password.isValid(result.user[0].password, request.body.password);
          if (valid) {
            token = Crypto.randomBytes(32).toString('base64');
            const query = '{createAuthnToken(token:?,user:?){id}}';
            const args = [token, result.user[0].id];
            return this.storage.query(query, args);
          }
        }).then(() => {
          if (token) {
            // @todo: Add expires_in (number of seconds).
            return {
              access_token: token,
              token_type: 'bearer'
            };
          }
          request.status = 401;
          return {};
        });
      }
    });
  }
}

module.exports = Authentication;