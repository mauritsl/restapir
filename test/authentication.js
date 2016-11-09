/* eslint-env node, mocha */
'use strict';

const Crypto = require('crypto');
const Promise = require('bluebird');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const Needle = Promise.promisifyAll(require('needle'));

const Application = require('../classes/Application.js');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Authentication', () => {
  let app;
  let accessToken;
  let userId;

  const uri = 'http://localhost:10023';

  before(() => {
    app = new Application({
      port: 10023,
      authentication: {
        admins: {
          admin: 'pbkdf2$sha256$7ps$w$ROMbPRTvX0w=$cTFu+GcA562wCATxUcNlR0cbKx7nG6fBU0IsS5wWusI='
        },
        userFields: ['id', 'admin'],
        usernameField: 'mail'
      },
      storage: {
        modelsDir: 'test/models',
        databases: {
          internal: {
            engine: 'redis',
            host: 'localhost',
            port: 6379,
            prefix: ''
          },
          rethink: {
            engine: 'RethinkDB',
            host: 'localhost',
            port: 28015,
            name: 'test'
          },
          restapi: {
            engine: 'RestApi'
          }
        }
      }
    });
    return app.ready();
  });

  after(() => {
    return app.close();
  });

  it('cannot create User without authentication', () => {
    const query = '{createUser(name:"Alice",mail:"alice@example.com",password:""){id}}';
    return Needle.getAsync(uri + '/graphql?q=' + encodeURIComponent(query)).then(response => {
      expect(response.statusCode).to.equal(403);
    });
  });

  it('can create User as admin', () => {
    const options = {
      headers: {
        Authorization: 'Basic ' + (new Buffer('admin:secret').toString('base64'))
      }
    };
    const query = '{createUser(name:"Alice",mail:"alice@example.com",password:"Welcome!"){id}}';
    return Needle.getAsync(uri + '/graphql?q=' + encodeURIComponent(query), options).then(response => {
      expect(response.statusCode).to.equal(200);
      expect(response.body).to.have.property('createUser');
      expect(response.body.createUser).to.have.property('id');
      expect(response.body.createUser.id).to.be.a('string');
      userId = response.body.createUser.id;
    });
  });

  it('will not provide an access token with invalid password', () => {
    const data = {
      grant_type: 'password',
      username: 'alice@example.com',
      password: 'invalid'
    };
    return Needle.postAsync(uri + '/token', data).then(response => {
      expect(response.statusCode).to.equal(401);
    });
  });

  it('will not provide an access token with invalid grant_type', () => {
    const data = {
      grant_type: 'test',
      username: 'alice@example.com',
      password: 'Welcome!'
    };
    return Needle.postAsync(uri + '/token', data).then(response => {
      // The request body is invalid, should give a 400 Bad Request.
      expect(response.statusCode).to.equal(400);
    });
  });

  it('will provide an access token with valid password', () => {
    const data = {
      grant_type: 'password',
      username: 'alice@example.com',
      password: 'Welcome!'
    };
    return Needle.postAsync(uri + '/token', data).then(response => {
      expect(response.statusCode).to.equal(200);
      expect(response.body.token_type).to.equal('bearer');
      expect(response.body.access_token).to.be.a('string');
      accessToken = response.body.access_token;
    });
  });

  it('can get user proflle using access token', () => {
    const data = {
      query: '{user:User(id:?){id, name}}',
      arguments: [userId]
    };
    const options = {
      json: true,
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    };
    return Needle.postAsync(uri + '/graphql', data, options).then(response => {
      expect(response.statusCode).to.equal(200);
      expect(response.body).have.property('user');
      expect(response.body.user).have.property('id', userId);
      expect(response.body.user).have.property('name', 'Alice');
    });
  });

  it('cannot get user proflle using wrong access token', () => {
    const data = {
      query: '{user:User(id:?){id, name}}',
      arguments: [userId]
    };
    const accessToken = Crypto.randomBytes(32).toString('base64');
    const options = {
      json: true,
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    };
    return Needle.postAsync(uri + '/graphql', data, options).then(response => {
      expect(response.statusCode).to.equal(401);
      expect(response.body).to.not.have.property('user');
    });
  });
});
