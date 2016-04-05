/* global describe, it */

'use strict'
var assert = require('assert') // eslint-disable-line
var should = require('should') // eslint-disable-line
var utils = require('../lib/utils.js')

describe('utils lib/utils.js', function () {
  it('return a range given min/max/count', function () {
    var r = utils.returnDistributedArray(20923044, 10000002, 8)

    r.length.should.equal(8)
    r[0].start.should.equal(10000002)
    r[7].end.should.equal(20923044)
  })
  it('Create a new Term based on system that has full FAST heading', function () {
    var data = {
      'nameLocal': 'TEST LOCAL',
      'nameFast': 'Justice, Administration of',
      'fast': {
        '_id': 985154,
        'fast': 985154,
        'prefLabel': 'Justice, Administration of',
        'altLabel': [
          'Justice, Administration of--Law and legislation',
          'Administration of justice',
          'Justice, Administration of'
        ],
        'sameAsLc': [
          'http://id.loc.gov/authorities/subjects/sh85071120',
          'sh85071120'
        ],
        'sameAsViaf': [],
        'normalized': [
          'justice administration of law legislation',
          'justice administration of',
          'administration of justice',
          'justice administration of'
        ],
        'type': 'Topical'
      },
      'type': 'terms:Topical',
      'fastOg': 985154
    }

    var r = utils.buildTerm(data)
    r.fast.should.equal(985154)
    r.termControlled.should.equal('Justice, Administration of')
    r.altForms[0].term.should.equal('Justice, Administration of--Law and legislation')
  })

  it('Create a new Term based on system that has no FAST heading', function () {
    var data = { nameLocal: 'Insurrection, 1919.',
      nameFast: false,
      fast: undefined,
      type: 'terms:Chronological',
      fastOg: false,
    source: { source: 'shadowcat', id: 10000493 } }

    var r = utils.buildTerm(data)
    r.fast.search('noFast').should.above(-1)
    r.termControlled.should.equal('Insurrection, 1919.')
    r.altForms.length.should.equal(0)
  })
})
