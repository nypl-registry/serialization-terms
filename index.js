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

  /**
   * A cluster script the spawns workers to build registry terms from archives compomnet terms
   *
   * @param  {function} cb - Nothing returned
   */
  this.archivesComponentsSerializeTerms = require(`${__dirname}/lib/archives_serialize_components_terms`)

  /**
   * A cluster script the spawns workers to build registry terms from MMS collections terms
   *
   * @param  {function} cb - Nothing returned
   */
  this.mmsCollectionsSerializeTerms = require(`${__dirname}/lib/mms_serialize_collections_terms`)

  /**
   * A cluster script the spawns workers to build registry terms from MMS containers terms
   *
   * @param  {function} cb - Nothing returned
   */
  this.mmsContainersSerializeTerms = require(`${__dirname}/lib/mms_serialize_containers_terms`)

  /**
   * A cluster script the spawns workers to build registry terms from MMS items terms
   *
   * @param  {function} cb - Nothing returned
   */
  this.mmsItemsSerializeTerms = require(`${__dirname}/lib/mms_serialize_items_terms`)

  /**
   * A cluster script the spawns workers to number the terms
   *
   * @param  {function} cb - Nothing returned
   */
  this.enumerateTerms = require(`${__dirname}/lib/enumerate_terms`)

  /**
   * Prepare the terms collection and do anything we need to do before we start the serialization
   *
   * @param  {function} cb - Nothing returned
   */
  this.prepareTerms = require(`${__dirname}/lib/prepare`)
}

module.exports = exports = new SerializeTerms()
