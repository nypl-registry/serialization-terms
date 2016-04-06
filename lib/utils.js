'use strict'
// var lexicon = require('nypl-registry-utils-lexicon')
var db = require('nypl-registry-utils-database')
var normalize = require('nypl-registry-utils-normalize')
var _ = require('highland')
var uuid = require('node-uuid')
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
    termLocal: false,
    registry: 'temp' + uuid.v4(),
    termControlled: false,
    source: systemTerm.source,
    type: false,
    termNormalized: [],
    altForms: []
  }
  if (systemTerm.nameLocal) systemTerm.termLocal = systemTerm.nameLocal

  if (systemTerm.term) {
    newTerm.altForms = systemTerm.term.altForms
    newTerm.termNormalized = systemTerm.term.termNormalized
  }

  if (systemTerm.fast) {
    newTerm.fast = (!isNaN(systemTerm.fast.fast)) ? parseInt(systemTerm.fast.fast) : systemTerm.fast.fast
    newTerm.fastAll.push((!isNaN(systemTerm.fast.fast)) ? parseInt(systemTerm.fast.fast) : systemTerm.fast.fast)
  } else {
    if (systemTerm.fastOg) {
      newTerm.fast = parseInt(systemTerm.fastOg)
    } else {
      newTerm.fast = 'noFast' + uuid.v4()
    }
    newTerm.fastAll.push(newTerm.fast)
  }

  if (systemTerm.type) {
    newTerm.type = systemTerm.type
  }
  if (systemTerm.fast && systemTerm.fast.type) {
    newTerm.type = 'terms:' + systemTerm.fast.type
  }
  if (!newTerm.type) {
    newTerm.type = 'terms:Topical'
  }

  // the local normalized
  if (systemTerm.termLocal) {
    newTerm.termLocal = systemTerm.termLocal
    newTerm.termControlled = systemTerm.termLocal // will overwrite below w/ better
    var termLocalNormal = normalize.singularize(normalize.normalizeAndDiacritics(systemTerm.termLocal))
    if (termLocalNormal !== '' && newTerm.termNormalized.indexOf(termLocalNormal) === -1) newTerm.termNormalized.push(termLocalNormal)
  }

  // the FAST normalized
  if (systemTerm.fast && systemTerm.fast.prefLabel) {
    newTerm.termControlled = systemTerm.fast.prefLabel
    var prefLabelNormal = normalize.singularize(normalize.normalizeAndDiacritics(systemTerm.fast.prefLabel))
    if (prefLabelNormal !== '' && newTerm.termNormalized.indexOf(prefLabelNormal) === -1) newTerm.termNormalized.push(prefLabelNormal)
  }

  // the FAST alt forms
  if (systemTerm.fast && systemTerm.fast.altLabel) {
    systemTerm.fast.altLabel.forEach((altLabelValue) => {
      var altLabelNormal = normalize.singularize(normalize.normalizeAndDiacritics(altLabelValue))
      if (altLabelNormal !== '' && newTerm.termNormalized.indexOf(altLabelNormal) === -1) {
        newTerm.termNormalized.push(altLabelNormal)
        if (!newTerm.termControlled) return
        newTerm.altForms.push({
          term: altLabelValue,
          type: 'fast.altForms',
          source: 'FAST',
          id: newTerm.fast,
          poverlap: normalize.percentOverlap(newTerm.termControlled, altLabelValue),
          fuzzy: newTerm.termControlled.score(altLabelValue, 0.5)
        })
      }
    })
  }

  if (!newTerm.termControlled) {
    // console.log('NO CONTROLLED TERM!!!!')
    // console.log(systemTerm)
    if (systemTerm.nameFast && !systemTerm.nameLocal) newTerm.termControlled = systemTerm.nameFast
    if (systemTerm.fast && systemTerm.fast.prefLabel) newTerm.termControlled = systemTerm.fast.prefLabel
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
      if (records.length === 1) {
        if (cb) cb(err, {id: term, data: records[0]})
      } else if (records.length > 5) {
        if (cb) cb(err, {id: term, data: false})
      } else if (records.length > 1) {
        // sometimes there are mulitple matches, try our best to use the best most similar one
        var bestScore = -100
        var bestMatch = false
        for (var x in records) {
          var score = records[x].prefLabel.score(term, 0.5)
          if (score > bestScore) {
            bestScore = score
            bestMatch = records[x]
          }
        }

        if (bestScore > 0.2) {
          if (cb) cb(err, {id: term, data: bestMatch})
        } else {
          if (cb) cb(err, {id: term, data: false})
        }
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
* Look up Term data by FAST
*
* @param  {int} fastId - the fast uri id
* @param  {function} cb - callback
*/
exports.returnTermByFast = function (fastId, cb) {
  db.returnCollectionRegistry('terms', (err, terms) => {
    if (err) console.log(err)
    terms.find({ fastAll: parseInt(fastId) }).toArray((err, records) => {
      if (records.length === 0) {
        if (cb) cb(err, {id: fastId, data: false})
      } else {
        if (cb) cb(err, {id: fastId, data: records[0]})
      }
    })
  })
}
/**
* Look up Term data by FAST
*
* @param  {int} fastId - the fast uri id
* @param  {function} cb - callback
*/
exports.returnTermByTerm = function (term, cb) {
  db.returnCollectionRegistry('terms', (err, terms) => {
    if (err) console.log(err)
    terms.find({ termNormalized: normalize.singularize(normalize.normalizeAndDiacritics(term)) }).toArray(function (err, records) {
      if (records.length === 1) {
        if (cb) cb(err, {id: term, data: records[0]})
      } else if (records.length > 5) {
        if (cb) cb(err, {id: term, data: false})
      } else if (records.length > 1) {
        var bestScore = -100
        var bestMatch = false
        for (var x in records) {
          if (records[x].termControlled) {
            var score = records[x].termControlled.score(term, 0.5)
            if (score > bestScore) {
              bestScore = score
              bestMatch = records[x]
            }
          }
        }
        if (bestScore > 0.01) {
          if (cb) cb(err, {id: term, data: bestMatch})
        } else {
          if (cb) cb(err, {id: term, data: false})
        }
      } else {
        if (cb) cb(err, {id: term, data: records[0]})
      }
    })
  })
}
/**
* Lookup all terms by fast in fast lookup table
*
* @param  {object} termObject - object with terms array
* @param  {function} cb - callback
* @return {obj} viaf data -
*/
exports.lookupAllTermsInFastByFast = (termObject, cb) => {
  // builds a lookup of all the term so we can save time if there are the same agent twice (contributor and subject for example)
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
* @param  {object} termObject - object with terms array
* @param  {function} cb - callback
* @return {obj} viaf data -
*/
exports.lookupAllTermsInFastByPrefLabel = (termObject, cb) => {
  // builds a lookup of all the term so we can save time if there are the same agent twice (contributor and subject for example)
  var lookup = {}

  _(termObject.terms)
    .map((term) => {
      if (term.fast) return ''
      if (term.termLocal && !term.nameLocal) term.nameLocal = term.termLocal
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
        if (lookup[term.nameLocal]) term.fastOg = lookup[term.nameLocal].fast
        if (!term.fast) term.fast = lookup[term.nameLocal]
        return term
      })
      if (cb) cb(null, termObject)
    })
}
/**
* Lookup all terms by fast in fast lookup table
*
* @param  {object} termObject - object with terms array
* @param  {function} cb - callback
* @return {obj} viaf data -
*/
exports.lookupAllTermsInFastByPreconfigured = (termObject, cb) => {
  // builds a lookup of all the term so we can save time if there are the same agent twice (contributor and subject for example)
  var lookup = {}

  _(termObject.terms)
    .map((term) => {
      if (term.fast) return ''
      if (!term.preconfigured) return ''
      if (lookup[term.preconfigured]) return ''
      if (term.preconfigured === 'Poetry--Collections') console.log(term.preconfigured)
      return term.preconfigured
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
        if (!term.fast) {
          term.fast = lookup[term.preconfigured]
          if (lookup[term.preconfigured]) {
            if (!term.fastOg) term.fastOg = lookup[term.preconfigured].fast
          }
        }
        return term
      })
      if (cb) cb(null, termObject)
    })
}
/**
* Lookup all terms by fast in fast lookup table by lc id
*
* @param  {object} termObject - object with terms array
* @param  {function} cb - callback
*/
exports.lookupAllTermsInFastByLcId = (termObject, cb) => {
  // builds a lookup of all the terms so we can save time if there are the same agent twice (contributor and subject for example)
  var lookup = {}

  _(termObject.terms)
    .map((term) => {
      if (term.fast) return ''
      if (!term.lcId) return ''
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
        if (!term.fastOg) term.fastOg = (lookup[term.lcId]) ? lookup[term.lcId].fast : false
        if (!term.fast) term.fast = lookup[term.lcId]
        return term
      })
      if (cb) cb(null, termObject)
    })
}

/**
* Lookup all terms by fast in fast lookup table by lc id
*
* @param  {object} termObject - object with terms array
* @param  {function} cb - callback
*/
exports.lookupAllTermsInFastByTerm = (termObject, cb) => {
  // builds a lookup of all the terms so we can save time if there are the same agent twice (contributor and subject for example)
  var lookup = {}

  _(termObject.terms)
    .map((term) => {
      if (term.fast) return ''
      if (term.termLocal && !term.nameLocal) term.nameLocal = term.termLocal
      if (lookup[term.nameLocal]) return ''

      return term.nameLocal
    })
    .compact()
    .map(_.curry(exports.returnFastByTerm))
    .nfcall([])
    .parallel(5)
    .map((results) => {
      lookup[results.id] = results.data
    })
    .done(() => {
      // backfill in the data
      termObject.terms = termObject.terms.map((term) => {
        if (!term.fastOg) term.fastOg = (lookup[term.nameLocal]) ? lookup[term.nameLocal].fast : false
        if (!term.fast) term.fast = lookup[term.nameLocal]
        return term
      })
      if (cb) cb(null, termObject)
    })
}

/**
* Lookup all terms by fast in existing terms table
*
* @param  {object} termObject - object with terms array
* @param  {function} cb - callback
*/
exports.lookupAllTermsInTermsByFast = (termObject, cb) => {
  // builds a lookup of all the terms so we can save time if there are the same agent twice (contributor and subject for example)
  var lookup = {}

  _(termObject.terms)
    .map((term) => {
      if (term.term) return ''
      if (lookup[term.fastOg]) return ''
      return term.fastOg
    })
    .compact()
    .map(_.curry(exports.returnTermByFast))
    .nfcall([])
    .parallel(5)
    .map((results) => {
      lookup[results.id] = results.data
    })
    .done(() => {
      // backfill in the data
      termObject.terms = termObject.terms.map((term) => {
        term.term = lookup[term.fastOg]
        return term
      })

      if (cb) cb(null, termObject)
    })
}
/**
* Lookup all terms by normalized in existing terms table...terms terms terms terms terms termmmmmsssss
*
* @param  {object} termObject - object with terms array
* @param  {function} cb - callback
*/
exports.lookupAllTermsInTermsByTerm = (termObject, cb) => {
  // builds a lookup of all the terms so we can save time if there are the same agent twice (contributor and subject for example)
  var lookup = {}

  _(termObject.terms)
    .map((term) => {
      if (term.term) return ''
      if (term.termLocal && !term.nameLocal) term.nameLocal = term.termLocal
      if (!term.nameLocal) return ''
      if (lookup[term.nameLocal]) return ''
      return term.nameLocal
    })
    .compact()
    .map(_.curry(exports.returnTermByTerm))
    .nfcall([])
    .parallel(5)
    .map((results) => {
      lookup[results.id] = results.data
    })
    .done(() => {
      // backfill in the data
      termObject.terms = termObject.terms.map((term) => {
        if (!term.term) term.term = lookup[term.nameLocal]
        return term
      })
      if (cb) cb(null, termObject)
    })
}

/**
* loop through all the terms to be updated
*
* @param  {array} terms - Array terms
* @param  {function} cb - callback
* @return {obj} viaf data -
*/
exports.updateAllTerms = (terms, cb) => {
  var termControlledAdded = []
  _(terms)
    .map(_.curry(exports.addTerm))
    .nfcall([])
    .parallel(5)
    .map((termControlled) => {
      if (termControlled) termControlledAdded.push(termControlled)
    })
    .done(() => {
      if (cb) cb(null, termControlledAdded)
    })
}

/**
* Update the terms collection based if they have FAST or not
*
* @param  {obj} agent - the update agent
* @param  {function} cb - callback
*/
exports.addTerm = function (term, cb) {
  db.returnCollectionRegistry('terms', (err, terms) => {
    if (err) console.log(err)

    if (isNaN(term.fast)) {
      // console.log(term.termControlled)
      terms.update({ termControlled: term.termControlled }, { $set: term }, {upsert: true}, function (err, result) {
        if (err) {
          if (err.toString().search('termControlled_1 dup key') === -1 && err.toString().search('fastAll_1 dup key') === -1) {
            console.log(term)
            db.logError('Term Serialization - Catalog - Cannot update/insert record by termControlled:', JSON.stringify({'term': term, 'error': err}))
          }
          if (cb) cb(null, false)
        } else {
          if (cb) cb(null, term.termControlled)
        }
      })
    } else {
      terms.update({ fast: term.fast }, { $set: term }, {upsert: true}, function (err, result) {
        if (err) {
          if (err.toString().search('fast_1 dup key') === -1 && err.toString().search('fastAll_1 dup key') === -1 && err.toString().search('termControlled_1 dup key') === -1) {
            console.log(term)
            db.logError('Agent Serialization - Catalog - Cannot update/insert record by fast:', JSON.stringify({'term': term, 'error': err}))
          }
          if (cb) cb(null, false)
        } else {
          if (cb) cb(null, term.termControlled)
        }
      })
    }
  })
}
