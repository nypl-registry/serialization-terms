'use strict'
var crier = require('nypl-registry-utils-crier')
var db = require('nypl-registry-utils-database')
var clc = require('cli-color')

module.exports = function (cb) {
  console.log(clc.whiteBright.bgRedBright('----- About to Drop the Terms Lookup collection registry-ingest in 5 seconds ----- ctrl-c now to abort'))
  crier.registrySay(':black_large_square: :black_large_square: Terms Serialization Starting - Dropping registry-ingest agent lookup. :black_large_square: :black_large_square:')
  setTimeout(function () {
    db.prepareRegistryIngestTerms(function () {
      if (cb) cb()
    })
  }, 5000)
}
