/* eslint-env node, mocha */
'use strict';

const Crypto = require('crypto');

const _ = require('lodash');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

const Transformation = require('../classes/transformation');

const expect = chai.expect;
chai.use(chaiAsPromised);

/**
 * @doc transformations
 * Transformations define how objects can be transformed from one format to another.
 * Input and output objects are always in JSON format.
 *
 * The transformation process is a chain of processing functions, each function
 * processing the output of the preceding function.
 * A transformation template itself is a JSON object in which each key is a
 * processing function. Example template in YAML:
 * ```yaml
 * get: /data
 * object:
 *   foo: /bar
 * ```
 * This template will convert ``{data:{bar:"baz"}}`` to ``{bar:"baz"}`` in the
 * first step and finally to ``{foo:"baz"}`` in the second.
 * Templates can also transform arrays:
 * ```yaml
 * get: /items
 * map:
 *   baz: /qux
 * ```
 * This will convert ``{items:[{qux:"quux"},{qux:"garply"}]}`` to
 * ``[{baz:"quux"},{baz:"garply"}]``.
 *
 * [JSONPointer](https://www.npmjs.com/package/jsonpointer) is used for the
 * selectors.
 *
 * More complex structures can be generated by the "object" operator. Each property
 * of this object will be added as a property in the output as well. The value
 * for this property is a new transformation chain, or a query string, which is
 * a shorthand for ``{get: "query"}``.
 */
describe('Transformation', () => {
  it('can execute empty transformation', () => {
    const transformer = new Transformation({});
    expect(transformer.transform({})).to.deep.equal({});
  });

  it('will return null when input is null', () => {
    const transformer = new Transformation({});
    expect(transformer.transform(null)).to.equal(null);
  });

  it('will return null when input is undefined', () => {
    const transformer = new Transformation({});
    expect(transformer.transform(undefined)).to.equal(null);
  });

  it('will fail on unknown operator', () => {
    const fn = () => {
      const transformer = new Transformation({
        unknownOp: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw('Unknown function unknownOp');
  });

  /**
   * @doc
   * The output for a transformation is null when encountering errors,
   * for example when trying to get an unexisting property.
   * Any null output will break the chain. That means that in the chain below,
   * the result is ``null``.
   *
   * ```yaml
   * get: /unknown
   * hash:
   *   algorithm: md5
   *   encoding: hex
   * ```
   *
   * The ``hash`` function is never executed because the execution bails after
   * the ``get`` function, which returns ``null``.
   */
  it('bails when missing output in chain', () => {
    const transformer = new Transformation({
      get: '/unknown',
      hash: {algorithm: 'md5', encoding: 'hex'}
    });
    expect(transformer.transform({})).to.equal(null);
  });

  it('can return item from json pointer', () => {
    const transformer = new Transformation({
      get: '/data'
    });
    expect(transformer.transform({data: {foo: 'bar'}})).to.deep.equal({foo: 'bar'});
  });

  it('will return null for non-existing items', () => {
    const transformer = new Transformation({
      get: '/a/b/c'
    });
    expect(transformer.transform({})).to.equal(null);
  });

  it('will return null for property on null', () => {
    const transformer = new Transformation({
      get: '/a/b'
    });
    expect(transformer.transform({a: null})).to.equal(null);
  });

  it('will fail on get when value is not a string', () => {
    const fn = () => {
      const transformer = new Transformation({
        get: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can return item from nested json pointer', () => {
    const transformer = new Transformation({
      get: '/data/foo'
    });
    expect(transformer.transform({data: {foo: 'bar'}})).to.equal('bar');
  });

  it('will return null for join pointer to unknown properties in nested jsonpath query', () => {
    const transformer = new Transformation({
      get: '/data/foo'
    });
    expect(transformer.transform({data: {bar: 'bar'}})).to.equal(null);
  });

  it('can generate static value', () => {
    const transformer = new Transformation({
      static: {foo: 'bar'}
    });
    expect(transformer.transform({data: {foo: 'bar'}})).to.deep.equal({foo: 'bar'});
  });

  it('can transform objects', () => {
    const transformer = new Transformation({
      object: {baz: '/foo'}
    });
    expect(transformer.transform({foo: 'bar'})).to.deep.equal({baz: 'bar'});
  });

  it('can transform nested objects', () => {
    const transformer = new Transformation({
      object: {
        foo: {
          get: '/foo',
          object: {
            bar: '/baz'
          }
        }
      }
    });
    expect(transformer.transform({
      foo: {
        baz: 'test'
      }
    })).to.deep.equal({
      foo: {
        bar: 'test'
      }
    });
  });

  it('will fail on objects when options is not an object', () => {
    const fn = () => {
      const transformer = new Transformation({
        object: 'wrong'
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can map arrays', () => {
    const transformer = new Transformation({
      map: {object: {baz: '/foo'}}
    });
    expect(transformer.transform([
      {foo: 'qux'},
      {foo: 'quux'}
    ])).to.deep.equal([
      {baz: 'qux'},
      {baz: 'quux'}
    ]);
  });

  it('allows using a string as option in map', () => {
    const transformer = new Transformation({
      map: '/foo'
    });
    expect(transformer.transform([
      {foo: 'qux'},
      {foo: 'quux'}
    ])).to.deep.equal([
      'qux',
      'quux'
    ]);
  });

  it('will return null on map when value is not an array', () => {
    const transformer = new Transformation({
      map: {}
    });
    expect(transformer.transform({})).to.equal(null);
  });

  it('can get substring', () => {
    const transformer = new Transformation({
      substring: {start: 1, length: 5}
    });
    expect(transformer.transform('Lorem ipsum')).to.equal('orem ');
  });

  it('can get substring without providing length', () => {
    const transformer = new Transformation({
      substring: {start: 1}
    });
    expect(transformer.transform('Lorem ipsum')).to.equal('orem ipsum');
  });

  it('can get substring without providing start', () => {
    const transformer = new Transformation({
      substring: {length: 5}
    });
    expect(transformer.transform('Lorem ipsum')).to.equal('Lorem');
  });

  it('will fail on substring when value is not a string', () => {
    const fn = () => {
      const transformer = new Transformation({
        substring: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can get length of array', () => {
    const transformer = new Transformation({
      length: {}
    });
    expect(transformer.transform([1, 2, 3])).to.equal(3);
  });

  it('can get length of string', () => {
    const transformer = new Transformation({
      length: {}
    });
    expect(transformer.transform('test')).to.equal(4);
  });

  it('will fail on length when value is not a string or array', () => {
    const fn = () => {
      const transformer = new Transformation({
        length: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can get md5/hex hash of a string', () => {
    const transformer = new Transformation({
      hash: {algorithm: 'md5', encoding: 'hex'}
    });
    expect(transformer.transform('Lorem')).to.equal(Crypto.createHash('md5').update('Lorem').digest('hex'));
  });

  it('can get sha1/base64 hash of a string', () => {
    const transformer = new Transformation({
      hash: {algorithm: 'sha1', encoding: 'base64'}
    });
    expect(transformer.transform('Lorem')).to.equal(Crypto.createHash('sha1').update('Lorem').digest('base64'));
  });

  it('defaults to md5/hex when not providing arguments for hash', () => {
    const transformer = new Transformation({
      hash: {}
    });
    expect(transformer.transform('Lorem')).to.equal(Crypto.createHash('md5').update('Lorem').digest('hex'));
  });

  it('will convert input to JSON before hashing input when input is not a string', () => {
    const transformer = new Transformation({
      hash: {}
    });
    expect(transformer.transform({foo: 'bar'})).to.equal(Crypto.createHash('md5').update('{"foo":"bar"}').digest('hex'));
  });

  it('can create new array', () => {
    const transformer = new Transformation({
      array: [
        {get: '/foo'},
        {get: '/bar'}
      ]
    });
    expect(transformer.transform({foo: 'Foo', bar: 'Bar'})).to.deep.equal(['Foo', 'Bar']);
  });

  it('allows using a string as array values in array', () => {
    const transformer = new Transformation({
      array: ['/foo', '/bar']
    });
    expect(transformer.transform({foo: 'Foo', bar: 'Bar'})).to.deep.equal(['Foo', 'Bar']);
  });

  it('will fail on array when options is not an array', () => {
    const fn = () => {
      const transformer = new Transformation({
        array: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can calculate union', () => {
    const transformer = new Transformation({
      union: [
        {get: '/foo'},
        {get: '/bar'}
      ]
    });
    expect(transformer.transform({foo: [1, 2, 3], bar: [3, 4, 5]})).to.deep.equal([1, 2, 3, 4, 5]);
  });

  it('will fail on union when options is not an array', () => {
    const fn = () => {
      const transformer = new Transformation({
        union: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can join array', () => {
    const transformer = new Transformation({
      join: {}
    });
    expect(transformer.transform(['foo', 'bar'])).to.equal('foobar');
  });

  it('will fail on join when value is not an array', () => {
    const fn = () => {
      const transformer = new Transformation({
        join: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can join array with separator', () => {
    const transformer = new Transformation({
      join: {
        separator: ' '
      }
    });
    expect(transformer.transform(['foo', 'bar'])).to.equal('foo bar');
  });

  it('can split string to array', () => {
    const transformer = new Transformation({
      split: {
        separator: ' '
      }
    });
    expect(transformer.transform('foo bar')).to.deep.equal(['foo', 'bar']);
  });

  it('will return empty array when split value is not an array', () => {
    const transformer = new Transformation({
      split: {
        separator: ' '
      }
    });
    expect(transformer.transform(false)).to.deep.equal([]);
  });

  it('will fail on split when missing separator', () => {
    const fn = () => {
      const transformer = new Transformation({
        split: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can filter empty items from array', () => {
    const transformer = new Transformation({
      filter: {}
    });
    expect(transformer.transform(['foo', '', 'bar', ''])).to.deep.equal(['foo', 'bar']);
  });

  it('will fail on filter when value is not an array', () => {
    const fn = () => {
      const transformer = new Transformation({
        filter: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can slice array', () => {
    const transformer = new Transformation({
      slice: {from: 1}
    });
    expect(transformer.transform([1, 2, 3])).to.deep.equal([2, 3]);
  });

  it('will fail on slice when value is not an array', () => {
    const fn = () => {
      const transformer = new Transformation({
        slice: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can count array elements', () => {
    const transformer = new Transformation({
      count: {}
    });
    expect(transformer.transform([1, 2, 3])).to.equal(3);
  });

  it('can use count to get string length', () => {
    const transformer = new Transformation({
      count: {}
    });
    expect(transformer.transform('test')).to.equal(4);
  });

  it('will return count of 0 for non-countable values', () => {
    const transformer = new Transformation({
      count: {}
    });
    expect(transformer.transform({})).to.equal(0);
  });

  it('can use "case" for basic value mapping', () => {
    const transformer = new Transformation({
      case: {
        Male: 1,
        Female: 2
      }
    });
    expect(transformer.transform('Male')).to.equal(1);
    expect(transformer.transform('Female')).to.equal(2);
    expect(transformer.transform('Unknown')).to.equal(null);
  });

  it('can override default case', () => {
    const transformer = new Transformation({
      case: {
        Male: 1,
        Female: 2,
        default: 0
      }
    });
    expect(transformer.transform('Unknown')).to.equal(0);
  });

  it('will fail on case when value is not an object', () => {
    const fn = () => {
      const transformer = new Transformation({
        case: null
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can get HTML tag', () => {
    const transformer = new Transformation({
      htmlTag: 'strong'
    });
    const html = '<p>This is a <strong>test</strong>.</p>';
    expect(transformer.transform(html)).to.equal('<strong>test</strong>');
  });

  it('will return null when HTML tag is not found', () => {
    const transformer = new Transformation({
      htmlTag: 'em'
    });
    const html = '<p>This is a <strong>test</strong>.</p>';
    expect(transformer.transform(html)).to.equal(null);
  });

  it('will fail on htmlTag when value is not a string', () => {
    const fn = () => {
      const transformer = new Transformation({
        htmlTag: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can get HTML tags', () => {
    const transformer = new Transformation({
      htmlTags: 'li'
    });
    const html = '<ul><li>Foo</li><li>Bar</li></ul>';
    expect(transformer.transform(html)).to.deep.equal(['<li>Foo</li>', '<li>Bar</li>']);
  });

  it('will return an empty array when no HTML tags were found', () => {
    const transformer = new Transformation({
      htmlTags: 'strong'
    });
    const html = '<ul><li>Foo</li><li>Bar</li></ul>';
    expect(transformer.transform(html)).to.deep.equal([]);
  });

  it('will fail on htmlTags when value is not a string', () => {
    const fn = () => {
      const transformer = new Transformation({
        htmlTags: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can get HTML tag text', () => {
    const transformer = new Transformation({
      htmlTagText: 'strong'
    });
    const html = '<p>This is a <strong>test</strong>.</p>';
    expect(transformer.transform(html)).to.equal('test');
  });

  it('will return null when HTML tag is not found', () => {
    const transformer = new Transformation({
      htmlTagText: 'em'
    });
    const html = '<p>This is a <strong>test</strong>.</p>';
    expect(transformer.transform(html)).to.equal(null);
  });

  it('will fail on htmlTagText when value is not a string', () => {
    const fn = () => {
      const transformer = new Transformation({
        htmlTagText: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can get HTML tags text', () => {
    const transformer = new Transformation({
      htmlTagsText: 'li'
    });
    const html = '<ul><li>Foo</li><li>Bar</li></ul>';
    expect(transformer.transform(html)).to.deep.equal(['Foo', 'Bar']);
  });

  it('will fail on htmlTagsText when value is not a string', () => {
    const fn = () => {
      const transformer = new Transformation({
        htmlTagsText: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can get HTML attribute', () => {
    const transformer = new Transformation({
      htmlAttribute: 'id'
    });
    const html = '<p id="test-paragraph">Lorem ipsum.</p>';
    expect(transformer.transform(html)).to.equal('test-paragraph');
  });

  it('will return null when HTML attribute is not found', () => {
    const transformer = new Transformation({
      htmlAttribute: 'id'
    });
    const html = '<p>Element without id-attribute.</p>';
    expect(transformer.transform(html)).to.equal(null);
  });

  it('will return null on htmlAttribute when input is not a string', () => {
    const transformer = new Transformation({
      htmlAttribute: 'id'
    });
    expect(transformer.transform({})).to.equal(null);
  });

  it('will return null on htmlAttribute when input is not HTML', () => {
    const transformer = new Transformation({
      htmlAttribute: 'id'
    });
    expect(transformer.transform('test')).to.equal(null);
  });

  it('will fail on htmlAttribute when value is not a string', () => {
    const fn = () => {
      const transformer = new Transformation({
        htmlAttribute: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can get table row', () => {
    const transformer = new Transformation({
      htmlTable: {
        cell: 0,
        text: 'age'
      }
    });
    const html = '<table><tr><td>Name</td><td>John</td></tr><tr><td>Age</td><td>34</td></tr></table>';
    expect(transformer.transform(html)).to.equal('<tr><td>Age</td><td>34</td></tr>');
  });

  it('can get table cell', () => {
    const transformer = new Transformation({
      htmlTable: {
        cell: 0,
        text: 'age',
        returnCell: 1
      }
    });
    const html = '<table><tr><td>Name</td><td>John</td></tr><tr><td>Age</td><td>34</td></tr></table>';
    expect(transformer.transform(html)).to.equal('34');
  });

  it('will fail on htmlTable when value is not an object', () => {
    const fn = () => {
      const transformer = new Transformation({
        htmlTable: ''
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('will fail on htmlTable when value is missing properties', () => {
    const fn = () => {
      const transformer = new Transformation({
        htmlTable: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('will return null on htmlTable when row is not found', () => {
    const transformer = new Transformation({
      htmlTable: {
        cell: 0,
        text: 'length'
      }
    });
    const html = '<table><tr><td>Name</td><td>John</td></tr><tr><td>Age</td><td>34</td></tr></table>';
    expect(transformer.transform(html)).to.equal(null);
  });

  it('can replace string', () => {
    const transformer = new Transformation({
      replace: {
        search: 'b',
        replace: 'g'
      }
    });
    expect(transformer.transform('boat')).to.equal('goat');
  });

  it('can replace string with regular expression', () => {
    const transformer = new Transformation({
      replace: {
        search: '/B/i',
        replace: 'g'
      }
    });
    expect(transformer.transform('boat')).to.equal('goat');
  });

  it('can replace string with regular expression', () => {
    const transformer = new Transformation({
      replace: {
        search: '/b([an]+)/',
        replace: '$1s'
      }
    });
    expect(transformer.transform('banana')).to.equal('ananas');
  });

  it('will return null on replace when input is not a string', () => {
    const transformer = new Transformation({
      replace: {
        search: 'a',
        replace: 'b'
      }
    });
    expect(transformer.transform({})).to.equal(null);
  });

  it('will fail on replace when value is missing properties', () => {
    const fn = () => {
      const transformer = new Transformation({
        replace: {}
      });
      transformer.transform({});
    };
    expect(fn).to.throw();
  });

  it('can read JSON with fromJson', () => {
    const transformer = new Transformation({
      fromJson: {}
    });
    const object = {foo: 'bar'};
    expect(transformer.transform(JSON.stringify(object))).to.deep.equal(object);
  });

  it('can write JSON with toJson', () => {
    const transformer = new Transformation({
      toJson: {}
    });
    const object = {foo: 'bar'};
    expect(transformer.transform(object)).to.equal(JSON.stringify(object));
  });

  it('can read XML with fromXml', () => {
    const transformer = new Transformation({
      fromXml: {}
    });
    const xml = `<root test="true">
      <a>foo</a>
      <a>bar</a>
      <b>baz</b>
      <c type="text">qux</c>
    </root>`;
    const object = {
      root: {
        '@test': 'true',
        a: ['foo', 'bar'],
        b: 'baz',
        c: {
          '#text': 'qux',
          '@type': 'text'
        }
      }
    };
    expect(transformer.transform(xml)).to.deep.equal(object);
  });

  it('will return null when input for fromXml is not a string', () => {
    const transformer = new Transformation({
      fromXml: {}
    });
    expect(transformer.transform({})).to.equal(null);
  });

  it('can return current date', () => {
    const transformer = new Transformation({
      now: {}
    });
    const date = ~~(new Date() / 1e3);
    const result = transformer.transform({});
    // Expect date to be identical with at most 1s difference.
    expect(Math.abs(date - result) <= 1).to.equal(true);
  });

  const cases = {
    lowerCase: 'lorem ipsum',
    upperCase: 'LOREM IPSUM',
    camelCase: 'loremIpsum',
    kebabCase: 'lorem-ipsum',
    snakeCase: 'lorem_ipsum',
    nameCase: 'Lorem Ipsum',
    capitalize: 'Lorem ipsum'
  };
  Object.keys(cases).forEach(fn => {
    it('can change case with ' + fn, () => {
      const config = {};
      config[fn] = {};
      const transformer = new Transformation(config);
      expect(transformer.transform('lorem ipsum')).to.equal(cases[fn]);
      expect(transformer.transform('LOREM IPSUM')).to.equal(cases[fn]);
      expect(transformer.transform({})).to.equal(null);
    });
  });

  it('can transliterate unicode characters with deburr', () => {
    const transformer = new Transformation({
      deburr: {}
    });
    expect(transformer.transform('mi\u00dfstand')).to.equal('missstand');
    expect(transformer.transform('priv\u00e9')).to.equal('prive');
    expect(transformer.transform('chate\u00e2u')).to.equal('chateau');
    expect(transformer.transform({})).to.equal(null);
  });

  it('can match value with schema using assert function', () => {
    const transformer = new Transformation({
      assert: {
        name: {type: 'string'}
      }
    });
    const data = {name: 'John'};
    // Explicitly clone the value to make sure it wasn't changed.
    expect(transformer.transform(_.clone(data))).to.deep.equal(data);
  });

  it('will throw error when assertion did not pass', () => {
    const transformer = new Transformation({
      assert: {
        name: {type: 'string'}
      }
    });
    const data = {name: true};
    expect(() => {
      transformer.transform(data);
    }).to.throw();
  });
});
