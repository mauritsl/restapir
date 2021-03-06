/* eslint-env node, mocha */
'use strict';

const Crypto = require('crypto');

const Bluebird = require('bluebird');
const Needle = Bluebird.promisifyAll(require('needle'));
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

const Container = require('../classes/container');

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Files', () => {
  let container;
  let storage;

  const uri = 'http://localhost:10023';

  before(async () => {
    container = new Container();
    await container.startup();

    const config = await container.get('Config');
    config.set({
      port: 10023,
      storage: {
        modelsDir: 'test/files/models',
        databases: {
          internal: {
            engine: 'redis',
            host: 'localhost',
            port: 6379,
            prefix: ''
          },
          files: {
            engine: 'LocalFiles',
            directory: '/tmp/files'
          }
        }
      }
    });
    const app = await container.get('Application');
    storage = app.storage;
  });

  after(async () => {
    await container.shutdown();
  });

  it('can create file', () => {
    let id;
    return storage.query('{createFile{id}}').then(result => {
      id = result.createFile.id;
      return storage.query('{File(id:$id){id,finished}}', {id});
    }).then(result => {
      expect(result.File).to.deep.equal({
        id,
        finished: false
      });
    });
  });

  it('can add metadata to file', () => {
    let id;
    return storage.query('{createFile(filename:"test.txt",description:"Testfile"){id}}').then(result => {
      id = result.createFile.id;
      return storage.query('{File(id:$id){id,filename,description}}', {id});
    }).then(result => {
      expect(result.File.id).to.equal(id);
      expect(result.File.filename).to.equal('test.txt');
      expect(result.File.description).to.equal('Testfile');
    });
  });

  it('can update metadata', () => {
    let id;
    return storage.query('{createFile(filename:"test.txt",description:"Testfile"){id}}').then(result => {
      id = result.createFile.id;
      return storage.query('{File(id:$id){id,filename,description}}', {id});
    }).then(result => {
      expect(result.File.filename).to.equal('test.txt');
      expect(result.File.description).to.equal('Testfile');
      return storage.query('{updateFile(id:$id,filename:"test2.txt"){id,filename}}', {id});
    }).then(() => {
      return storage.query('{File(id:$id){id,filename,description}}', {id});
    }).then(result => {
      expect(result.File.filename).to.equal('test2.txt');
      expect(result.File.description).to.equal('Testfile');
    });
  });

  it('can upload a file using multipart POST request', () => {
    let id;
    const body = Crypto.randomBytes(8).toString('base64');
    const input = {
      file: {
        buffer: new Buffer(body),
        filename: 'test.txt',
        content_type: 'text/plain'
      }
    };
    const options = {multipart: true};
    return Needle.postAsync(uri + '/file/File', input, options).then(response => {
      expect(response.statusCode).to.equal(200);
      expect(response.body).to.have.property('id');
      id = response.body.id;
      return Needle.getAsync(uri + '/file/File/' + id).then(response => {
        expect(response.statusCode).to.equal(200);
        expect(response.body.toString()).to.equal(body);
        // And check that it automatically saved the filename and mimetype in
        // the designated fields.
        expect(response.headers['content-disposition']).to.equal('attachment; filename="test.txt"');
        expect(response.headers['content-type']).to.equal('text/plain; charset=utf-8');
      });
    });
  });

  it('can upload a file using PUT request', () => {
    let id;
    const body = Crypto.randomBytes(8).toString('base64');
    const data = new Buffer(body);
    const options = {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': data.byteLength
      }
    };
    return Needle.putAsync(uri + '/file/File', data, options).then(response => {
      expect(response.statusCode).to.equal(200);
      expect(response.body).to.have.property('id');
      id = response.body.id;
      return Needle.getAsync(uri + '/file/File/' + id).then(response => {
        expect(response.statusCode).to.equal(200);
        expect(response.body.toString()).to.equal(body);
      });
    });
  });

  /**
   * @doc
   * Field values can be provided via HTTP headers. Start the header name
   * with 'X-Meta-' followed by the fieldname. The fieldname is case
   * insensitive. Field data must be in JSON format. All headers that
   * do not meet the specifications are silently ignored.
   */
  it('can add fields in PUT request headers', () => {
    let id;
    const data = Crypto.randomBytes(8);
    const options = {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': data.byteLength,
        'X-Meta-Description': JSON.stringify('Lorem ipsum'),
        'X-Meta-Number': JSON.stringify(34),
        'X-Meta-Unknown': 'should be ignored'
      }
    };
    return Needle.putAsync(uri + '/file/File', data, options).then(response => {
      expect(response.statusCode).to.equal(200);
      id = response.body.id;
      return storage.query('{File(id:$id){description,number}}', {id});
    }).then(result => {
      expect(result.File.description).to.equal('Lorem ipsum');
      expect(result.File.number).to.equal(34);
    });
  });

  it('sets Content-Length header on GET requests', () => {
    let id;
    const data = Crypto.randomBytes(8);
    const options = {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': data.byteLength
      }
    };
    return Needle.putAsync(uri + '/file/File', data, options).then(response => {
      expect(response.statusCode).to.equal(200);
      id = response.body.id;
      return Needle.getAsync(uri + '/file/File/' + id);
    }).then(response => {
      expect(response.statusCode).to.equal(200);
      expect(response.body.toString('hex')).to.equal(data.toString('hex'));
      expect(response.headers).to.have.property('content-length');
      expect(response.headers['content-length']).to.equal(String(data.byteLength));
    });
  });
});
