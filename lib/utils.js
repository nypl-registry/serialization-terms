'use strict'
// var lexicon = require('nypl-registry-utils-lexicon')
var db = require('nypl-registry-utils-database')
var normalize = require('nypl-registry-utils-normalize')
var _ = require('highland')

/**
* Given max and min it will distrubute across the requested number as a array of objects and add the min to the total of each one.
* This is used to divide up a range of numbers into more or less equal chunks, we add the min to it so they are valid bnumbers in the range
* @param  {int} max number -
* @param  {int} min number -
* @param  {int} count - split among how many

* @return {array} - an array of objects: { start: 12345, stop: 54321 }
*/
exports.returnDistributedArray = (max, min, count) => {
  var perBot = (max - min) / count
  return Array.from(new Array(count), (x, i) => {
    return {start: Math.floor(i * perBot + min), end: Math.floor((i + 1) * perBot + min)}
  })
}

exports.buildTerm = function (systemTerm) {
  var newTerm = {
    fast: false,
    fastAll: [],
    registry: 'temp' + Date.now() + Math.floor(Math.random() * (1000000 - 1)) + 1,
    termControlled: false,
    source: false,
    useCount: 0,
    type: false,
    termNormalized: []
  }

  if (systemTerm.fast) {
    newTerm.fast = systemTerm.fast
    newTerm.fastAll.push(systemTerm.fast)
  } else {
    newTerm.fast = 'noFast' + Date.now() + Math.floor(Math.random() * (1000000 - 1)) + 1
    newTerm.fastAll.push(newTerm.fast)
  }

  if (systemTerm.type) {
    newTerm.type = systemTerm.type
  }

  if (systemTerm.termLocal) {
    newTerm.termLocal = systemTerm.termLocal
    var termLocalNormal = normalize.singularize(normalize.normalizeAndDiacritics(systemTerm.termLocal))
    if (termLocalNormal !== '' && newTerm.termNormalized.indexOf(termLocalNormal) === -1) newTerm.termNormalized.push(termLocalNormal)
  }

  if (systemTerm.termControlled) {
    newTerm.termControlled = systemTerm.termControlled
    var termControlledNormal = normalize.singularize(normalize.normalizeAndDiacritics(systemTerm.termControlled))
    if (termControlledNormal !== '' && newTerm.termNormalized.indexOf(termControlledNormal) === -1) newTerm.termNormalized.push(termControlledNormal)
  }

  if (systemTerm.termAlt) {
    systemTerm.termAlt.forEach((t) => {
      var tNormal = normalize.singularize(normalize.normalizeAndDiacritics(t))
      if (tNormal !== '' && newTerm.termNormalized.indexOf(tNormal) === -1) newTerm.termNormalized.push(tNormal)
    })
  }

  if (!newTerm.termControlled) {
    console.log('NO CONTROLLED TERM!!!!')
    console.log(systemTerm)

    if (systemTerm.termLocal) newTerm.termControlled = systemTerm.termLocal
  }

  return newTerm
}
/**
* Look up FAST data by fast ID
*
* @param  {int} fastId - the fast id
* @param  {function} cb - callback
*/
exports.returnFastByFast = function (fastId, cb) {
  db.returnCollectionRegistry('fast', (err, fastLookup) => {
    if (err) console.log(err)
    fastLookup.find({ _id: parseInt(fastId) }).toArray((err, records) => {
      if (err) console.log(err)
      if (records.length === 0) {
        if (cb) cb(err, {id: fastId, data: false})
      } else {
        if (cb) cb(err, {id: fastId, data: records[0]})
      }
    })
  })
}
/**
* Look up FAST data by controled and alt terms
*
* @param  {string} term - the terms to search for
* @param  {function} cb - callback
*/
exports.returnFastByTerm = function (term, cb) {
  db.returnCollectionRegistry('fast', function (err, fastLookup) {
    if (err) console.log(err)
    fastLookup.find({ normalized: normalize.singularize(normalize.normalizeAndDiacritics(term)) }).toArray(function (err, records) {
      if (err) console.log(err)
      if (records.length === 0) {
        if (cb) cb(err, {id: term, data: false})
      } else {
        if (cb) cb(err, {id: term, data: records[0]})
      }
    })
  })
}
/**
* Look up FAST data by prefLabel term
*
* @param  {string} prefLabel - the prefLabel to search for
* @param  {function} cb - callback
*/
exports.returnFastByPrefLabel = function (prefLabel, cb) {
  db.returnCollectionRegistry('fast', function (err, fastLookup) {
    if (err) console.log(err)
    fastLookup.find({ prefLabel: {$in: [prefLabel, `${prefLabel}.`]} }).toArray(function (err, records) {
      if (err) console.log(err)
      if (records.length === 0) {
        if (cb) cb(err, {id: prefLabel, data: false})
      } else {
        if (cb) cb(err, {id: prefLabel, data: records[0]})
      }
    })
  })
}
/**
* Look up FAST data by LCSH uri
*
* @param  {string} lcTerm - the full uri http://id.loc.gov/authorities/subjects/sh85003731 or uri id sh85003731
* @param  {function} cb - callback
*/
exports.returnFastByLc = function (lcTerm, cb) {
  db.returnCollectionRegistry('fast', function (err, fastLookup) {
    if (err) console.log(err)
    fastLookup.find({ sameAsLc: lcTerm }).toArray(function (err, records) {
      if (err) console.log(err)
      if (records.length === 0) {
        if (cb) cb(err, {id: lcTerm, data: false})
      } else {
        if (cb) cb(err, {id: lcTerm, data: records[0]})
      }
    })
  })
}

/**
* Lookup all terms by fast in fast lookup table
*
* @param  {array} agents - Array of 'sc:agents'
* @param  {function} cb - callback
* @return {obj} viaf data -
*/
exports.lookupAllTermsInFastByFast = (termObject, cb) => {
  // builds a lookup of all the agents so we can save time if there are the same agent twice (contributor and subject for example)
  var lookup = {}

  _(termObject.terms)
    .map((term) => {
      if (lookup[term.fast]) return ''
      return term.fast
    })
    .compact()
    .map(_.curry(exports.returnFastByFast))
    .nfcall([])
    .parallel(5)
    .map((results) => {
      lookup[results.id] = results.data
    })
    .done(() => {
      // backfill in the data
      termObject.terms = termObject.terms.map((term) => {
        term.fastOg = term.fast
        term.fast = lookup[term.fast]
        return term
      })
      if (cb) cb(null, termObject)
    })
}

/**
* Lookup all terms by fast in fast lookup table
*
* @param  {array} agents - Array of 'sc:agents'
* @param  {function} cb - callback
* @return {obj} viaf data -
*/
exports.lookupAllTermsInFastByPrefLabel = (termObject, cb) => {
  // builds a lookup of all the agents so we can save time if there are the same agent twice (contributor and subject for example)
  var lookup = {}

  _(termObject.terms)
    .map((term) => {
      if (term.fast) return ''
      if (!term.nameLocal) return ''
      if (lookup[term.nameLocal]) return ''
      return term.nameLocal
    })
    .compact()
    .map(_.curry(exports.returnFastByPrefLabel))
    .nfcall([])
    .parallel(5)
    .map((results) => {
      lookup[results.id] = results.data
    })
    .done(() => {
      // backfill in the data
      termObject.terms = termObject.terms.map((term) => {
        // term.fastOg = term.fast
        if (!term.fast) term.fast = lookup[term.nameLocal]
        return term
      })
      if (cb) cb(null, termObject)
    })
}
/**
* Lookup all terms by fast in fast lookup table by lc id
*
* @param  {array} agents - Array of 'sc:agents'
* @param  {function} cb - callback
* @return {obj} viaf data -
*/
exports.lookupAllTermsInFastByLcId = (termObject, cb) => {
  // builds a lookup of all the agents so we can save time if there are the same agent twice (contributor and subject for example)
  var lookup = {}

  _(termObject.terms)
    .map((term) => {
      if (term.fast) return ''
      if (term.lcId) return ''
      if (lookup[term.lcId]) return ''
      return term.lcId
    })
    .compact()
    .map(_.curry(exports.returnFastByLc))
    .nfcall([])
    .parallel(5)
    .map((results) => {
      lookup[results.id] = results.data
    })
    .done(() => {
      // backfill in the data
      termObject.terms = termObject.terms.map((term) => {
        // term.fastOg = term.fast
        if (!term.fast) term.fast = lookup[term.lcId]
        return term
      })
      if (cb) cb(null, termObject)
    })
}
// /**
// * Given a viaf ID it will return agent info from agents collection
// *
// * @param  {string} viaf - a string of the VIAF ID
// * @param  {function} cb - callback
// */
// exports.returnAgentByViaf = function (viaf, cb) {
//   db.returnCollectionRegistry('agents', (err, agents) => {
//     if (err) console.log(err)
//     agents.find({ viaf: viaf.toString() }).toArray((err, viafData) => {
//       if (err) console.log(err)
//       if (viafData.length === 0) {
//         cb(err, {id: viaf, data: false})
//       } else {
//         cb(err, {id: viaf, data: viafData[0]})
//       }
//     })
//   })
// }

// exports.returnAgentByName = function (name, cb) {
//   db.returnCollectionRegistry('agents', (err, agents) => {
//     if (err) console.log(err)
//     agents.find({ nameNormalized: normalize.normalizeAndDiacritics(name) }).toArray((err, records) => {
//       if (err) console.log(err)
//       if (records.length === 0) {
//         if (cb) cb(err, {name: name, data: false})
//       } else {
//         // figure out which to use based on the best controled term name
//         var bestScore = -1
//         var useName = false
//         records.forEach(function (r) {
//           var s = normalize.normalizeAndDiacritics(name).score(normalize.normalizeAndDiacritics(r.nameControlled), 0.5)
//           if (s > bestScore) {
//             bestScore = s
//             useName = r
//           }
//         })
//         if (cb) cb(err, {name: name, data: useName})
//       }
//     })
//   })
// }

// /**
// * Given a viaf ID it will return VIAF data from our viaf lookup collection
// *
// * @param  {string} viaf - a string of the VIAF ID
// * @param  {function} cb - callback
// */
// exports.returnViafData = (viaf, cb) => {
//   db.returnCollectionRegistry('viaf', (err, viafCollection) => {
//     if (err) console.log(err)
//     viafCollection.find({ viaf: viaf.toString() }).toArray((err, viafData) => {
//       if (err) console.log(err)

//       if (viafData.length > 1) console.log(`WARN: ${viaf} has more than one match!`) // TODO some better reporting

//       if (viafData.length === 0) {
//         // TODO some better reporting
//         // console.log('Could not find', viaf, 'in viaf lookup table!')

//         // we are going to try to figure this out in an attemp to not have a dead VIAF id
//         viafUtils.returnAllViafData(viaf.toString(), (err, results) => {
//           if (err) console.log(err)
//           var blankViaf = { flag: true, '_id': '', 'viaf': [], 'sourceCount': 1, 'type': false, 'hasLc': (results.checkForLc), 'hasDbn': false, 'lcId': (!results.checkForLc) ? false : results.checkForLc, 'gettyId': false, 'wikidataId': false, 'lcTerm': false, 'dnbTerm': false, 'viafTerm': false, 'birth': false, 'death': false, 'dbpediaId': false, 'normalized': [] }
//           // can we solve it with a redirect?
//           if (results.checkRedirect) {
//             blankViaf._id = results.checkRedirect
//             blankViaf.viaf.push(results.checkRedirect)
//             blankViaf.viaf.push(viaf.toString()) // add the bad one in there too for others to lookup against

//             viafWrapper.getViaf(blankViaf._id).then((record) => {
//               if (record.nameType) blankViaf.type = record.nameType
//               if (record.birthDate) blankViaf.birth = record.birthDate
//               if (record.deathDate) blankViaf.death = record.deathDate
//               if (record.heading) blankViaf.viafTerm = record.heading

//               record.mainHeadingEls.forEach((heading) => {
//                 if (heading.source === 'DNB' && heading.a) {
//                   blankViaf.hasDbn = true
//                   blankViaf.dnbTerm = heading.a
//                 }
//                 if (heading.source === 'LC' && heading.a) {
//                   blankViaf.hasLc = true
//                   blankViaf.lcTerm = heading.a
//                 }
//               })
//               record.sources.forEach((source) => {
//                 if (source.source === 'LC' && source.nsid) {
//                   blankViaf.lcId = source.nsid
//                 }
//                 if (source.source === 'WKP' && source.nsid) {
//                   blankViaf.wikidataId = source.nsid
//                 }
//                 if (source.source === 'JPG' && source.nsid) {
//                   blankViaf.gettyId = source.nsid
//                 }
//               })
//               // console.log('Checked viaf')
//               // console.log(blankViaf)
//               cb(err, {id: viaf, data: blankViaf})
//             })

//             return
//           }

//           // if it is deleted and there is an alt LC found we will try to get the VIAF
//           if (results.checkForDeleted && results.checkForLc) {
//             viafUtils.returnLcUseInstead(results.checkForLc, (err, results) => {
//               if (err) console.log(err)
//               // we tried, but could not get a VIAF out of all that mess
//               if (!results) {
//                 cb(err, {id: viaf, data: false})
//                 return false
//               }
//               blankViaf._id = results
//               blankViaf.viaf.push(results)
//               blankViaf.viaf.push(viaf.toString()) // add the bad one in there too for others to lookup against
//               viafWrapper.getViaf(results).then((record) => {
//                 if (record.nameType) blankViaf.type = record.nameType
//                 if (record.birthDate) blankViaf.birth = record.birthDate
//                 if (record.deathDate) blankViaf.death = record.deathDate
//                 if (record.heading) blankViaf.viafTerm = record.heading

//                 record.mainHeadingEls.forEach((heading) => {
//                   if (heading.source === 'DNB' && heading.a) {
//                     blankViaf.hasDbn = true
//                     blankViaf.dnbTerm = heading.a
//                   }
//                   if (heading.source === 'LC' && heading.a) {
//                     blankViaf.hasLc = true
//                     blankViaf.lcTerm = heading.a
//                   }
//                 })
//                 record.sources.forEach((source) => {
//                   if (source.source === 'LC' && source.nsid) {
//                     blankViaf.lcId = source.nsid
//                   }
//                   if (source.source === 'WKP' && source.nsid) {
//                     blankViaf.wikidataId = source.nsid
//                   }
//                   if (source.source === 'JPG' && source.nsid) {
//                     blankViaf.gettyId = source.nsid
//                   }
//                 })
//                 // console.log('Checked viaf')
//                 // console.log(blankViaf)

//                 cb(err, {id: viaf, data: blankViaf})
//               })
//             })

//             return
//           }

//           // no luck with any of thoese stragies
//           cb(err, {id: viaf, data: false})
//         })
//       } else {
//         cb(err, {id: viaf, data: viafData[0]})
//       }
//     })
//   })
// }

// /**
// * Given a naf ID it will return VIAF data from our viaf lookup collection
// *
// * @param  {string} lcId - a string of the lcId/naf ID
// * @param  {function} cb - callback
// */
// exports.returnViafDataByNaf = (lcId, cb) => {
//   db.returnCollectionRegistry('viaf', (err, viafCollection) => {
//     if (err) console.log(err)
//     viafCollection.find({ lcId: lcId }).toArray((err, viafData) => {
//       if (err) console.log(err)
//       if (viafData.length === 0) {
//         cb(err, {id: lcId, data: false})
//       } else {
//         cb(err, {id: lcId, data: viafData[0]})
//       }
//     })
//   })
// }

// /**
// * Update the agents collection by VIAF identfier
// *
// * @param  {obj} agent - the update agent
// * @param  {function} cb - callback
// */
// exports.addAgentByViaf = (agent, cb) => {
//   // console.log('addAgentByViaf', agent)
//   db.returnCollectionRegistry('agents', (err, agents) => {
//     if (err) console.log(err)
//     agents.update({viaf: agent.viaf[0]}, { $set: agent }, {upsert: true}, (err, result) => {
//       if (err) {
//         if (err.toString().search('duplicate key error collection') === -1) {
//           db.logError('Agent Serialization - Catalog - Cannot update/insert record:', JSON.stringify({'agent': agent, 'error': err}))
//         }
//       }
//       if (cb) cb(null, null)
//     })
//   })
// }

// /**
// * Update the agents collection by the namecontrolled string
// *
// * @param  {obj} agent - the update agent
// * @param  {function} cb - callback
// */
// exports.addAgentByName = function (agent, cb) {
//   // console.log('addAgentByName', agent)
//   db.returnCollectionRegistry('agents', (err, agents) => {
//     if (err) console.log(err)
//     agents.update({ nameControlled: agent.nameControlled }, { $set: agent }, {upsert: true}, function (err, result) {
//       if (err) {
//         if (err.toString().search('nameControlled_1 dup key') === -1) {
//           db.logError('Agent Serialization - Catalog - Cannot update/insert record:', JSON.stringify({'agent': agent, 'error': err}))
//         }
//       }
//       if (cb) cb(null, null)
//     })
//   })
// }
