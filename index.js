'use strict'

function SerializeTerms () {
  /**
   * A cluster script the spawns workers to build registry agents from sc:agents that have a VIAF id
   *
   * @param  {function} cb - Nothing returned
   */
  this.shadowcatSerializeTerms = require(`${__dirname}/lib/shadowcat_serialize_terms`)
}

module.exports = exports = new SerializeTerms()
