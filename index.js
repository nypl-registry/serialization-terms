'use strict'

function SerializeTerms () {
  /**
   * A cluster script the spawns workers to build registry terms from shadowcat terms
   *
   * @param  {function} cb - Nothing returned
   */
  this.shadowcatSerializeTerms = require(`${__dirname}/lib/shadowcat_serialize_terms`)

  /**
   * A cluster script the spawns workers to build registry terms from archives collections terms
   *
   * @param  {function} cb - Nothing returned
   */
  this.archivesCollectionsSerializeTerms = require(`${__dirname}/lib/archives_serialize_collections_terms`)
}

module.exports = exports = new SerializeTerms()
