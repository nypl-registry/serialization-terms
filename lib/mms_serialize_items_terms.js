'use strict'

module.exports = function (cb) {
  var db = require('nypl-registry-utils-database')
  var cluster = require('cluster')
  var crier = require('nypl-registry-utils-crier')
  var utils = require('../lib/utils.js')
  var clc = require('cli-color')
  var totalBots = 20
  var botRanges = []
  //
  // MASTER PROCESS
  //
  if (cluster.isMaster) {
    var totalDone = 0
    var totalTodo = 10000000000
    var totalAgentsAdded = 0
    var percent = 0
    var oldPercent = -1
    var activeMessage = ''

    crier.registrySay(':vertical_traffic_light: Term Serialization MMS Items starting.')

    // finds the counts in the bib records and split it up among the number of requested bots
    var findBibSplit = (splitCount, callback) => {
      db.returnCollectionRegistry('mmsItems', (err, mmsItems) => {
        if (err) console.log(err)
        mmsItems.find({}, {mmsDb: 1}).sort({mmsDb: 1}).limit(1).toArray((err, resultsMin) => {
          if (err) console.log(err)
          mmsItems.find({}, {mmsDb: 1}).sort({mmsDb: -1}).limit(1).toArray((err, resultsMax) => {
            if (err) console.log(err)
            var minMmsDb = resultsMin[0].mmsDb
            var maxMmsDb = resultsMax[0].mmsDb + 10 // add ten so it overshoots the end, make sure the last record it done
            callback(utils.returnDistributedArray(maxMmsDb, minMmsDb, splitCount))
          })
        })
      })
    }

    // fire off a count request so we know the progress
    db.returnCollectionRegistry('mmsItems', (err, mmsItems) => {
      if (err) console.log(err)
      mmsItems.count((err, count) => {
        if (err) console.log(err)
        totalTodo = count
      })
    })

    // this function spawns the worker and handles passing out bib ranges ++ the counter and restarting a worker if needed
    var spawnWorker = () => {
      var worker = cluster.fork()
      console.log('Spawing worker', worker.id)
      worker.on('message', function (msg) {
        // when a worker sends a "request" message we return one of the ranges for it to work on
        if (msg.request) {
          if (botRanges.length === 0) {
            worker.send({ die: true })
          } else {
            worker.send({ work: botRanges.shift() })
          }
        }
        // when the worker sends a counter message we ++ the counter
        if (msg.counter) {
          totalDone = totalDone + msg.counter
          percent = Math.floor(totalDone / totalTodo * 100)
          activeMessage = `MMS Items Term Serialization: ${percent}% ${totalDone} Items worked. Terms Processsed: ${totalAgentsAdded} Bots:${totalBots}`
          if (percent % 10 === 0 && percent !== oldPercent) {
            crier.registrySay(activeMessage)
            oldPercent = percent
          }
          process.stdout.cursorTo(0)
          process.stdout.write(clc.black.bgYellowBright(activeMessage))
        }
        if (msg.counterAdded) {
          totalAgentsAdded = totalAgentsAdded + msg.counterAdded
        }

        if (msg.restart) {
          console.log('Restarting this range:', msg.restart)
          crier.registrySay('Restarting Bot. Range:', msg.restart)
          botRanges.push(msg.restart)
          spawnWorker()
          totalBots++
        }
      })
    }

    // will return a array of objects telling what bnumber to start and end on
    // loop through and spawn a worker for each range of bnumbers
    findBibSplit(totalBots, (botSplit) => {
      // asign it to the master scoped var
      console.log(botSplit)
      botRanges = botSplit
      // spawn one for each range
      botSplit.forEach((x) => {
        spawnWorker()
      })
    })

    // when the worker exists we wait a sec and see if it was the last worker, if so kill the main process == end of the script
    cluster.on('exit', (worker, code, signal) => {
      totalBots = totalBots - 1
      setTimeout(() => {
        if (Object.keys(cluster.workers).length === 0) {
          crier.registrySay(activeMessage)
          crier.registrySay(':checkered_flag: MMS Items Term Serialization: Complete')
          if (cb) {
            setTimeout(() => {
              cb()
              cb = null // make sure it doesn't get called again since we are using setTimeout to check the worker status
            }, 1000)
          }
        }
      }, 500)
    })
  } else {
    //
    // THE WORKER
    //
    var lexicon = require('nypl-registry-utils-lexicon')
    var _ = require('highland')
    // keep track of what we are working on incase we need to ask the master process to restart the worker
    var workStart = 0
    var workEnd = 0
    var localCounter = 0

    // useful for debuging and restarting incase something bad happens
    var worked = false
    var workedLastOn = null
    setInterval(() => {
      if (!worked) {
        // console.log(`${cluster.worker.id} has not worked in the last few min:`, workedLastOn)
        db.logError(`${cluster.worker.id} has not worked in the last few min:`, JSON.stringify(workedLastOn))
        console.log(`Going to restart worker: ${cluster.worker.id}`)
        process.send({ restart: { start: workStart, end: workEnd } })
        process.exit(1)
      }
      worked = false
    }, 120000)

    process.on('message', (msg) => {
      if (msg.die) {
        console.log('Done Working. #', cluster.worker.id)
        process.exit(0)
      }
      if (msg.work) {
        workStart = msg.work.start
        workEnd = msg.work.end
        db.returnCollectionRegistry('mmsItems', (err, mmsItems) => {
          if (err) console.log(err)
          // this works by streaming a cursor between the two start/end range of bnumbers
          _(mmsItems.find({$and: [{mmsDb: {$gte: msg.work.start}}, {mmsDb: {$lt: msg.work.end}}]}, {'subjects': 1, 'mmsDb': 1}))
            .map((mmsItem) => {
              if (++localCounter % 10 === 0 && localCounter !== 0) process.send({ counter: 10 })
              // for debuging
              worked = true
              workedLastOn = mmsItem
              // keep track of where we are
              workStart = mmsItem.mmsDb
              // ++ the counter
              if (!mmsItem.subjects) return ''
              if (mmsItem.subjects.length === 0) return ''

              // the the subjects into the shape the methods expect
              mmsItem.terms = mmsItem.subjects.map((term) => {
                if (term.type === 'name') return false // these are taken care of in the agent serialization
                var r = {}
                r.termLocal = term.text
                r.type = lexicon.maps.mmsTermType[term.type]
                if (!term.text) return false
                r.preconfigured = (term.text.search('--') > -1) ? term.text.replace(/\s--\s/g, '--') : false
                r.lcId = term.valueURI
                return r
              })
              mmsItem.terms = mmsItem.terms.filter((term) => (term))

              return mmsItem
            })
            .compact()
            .map(_.curry(utils.lookupAllTermsInFastByPreconfigured))
            .nfcall([])
            .series()
            .map(_.curry(utils.lookupAllTermsInFastByPrefLabel))
            .nfcall([])
            .series()
            .map(_.curry(utils.lookupAllTermsInFastByLcId))
            .nfcall([])
            .series()
            .map((mmsItem) => {
              // any preconfigured terms that we did not find at this point needs to be split apart into their parts for lookup
              var newTerms = []
              mmsItem.terms.forEach((term) => {
                if (term.preconfigured && term.fast) {
                  // it is good to go
                  newTerms.push(term)
                } else if (term.preconfigured && !term.fast) {
                  term.preconfigured.split('--').forEach((subterm) => {
                    newTerms.push({
                      termLocal: subterm,
                      type: term.type,
                      lcId: false,
                      fast: false,
                      splited: true
                    })
                  })
                  mmsItem.splited = true
                } else {
                  // just a normal term add it to the pile
                  newTerms.push(term)
                }
              })
              mmsItem.terms = newTerms
              return mmsItem
            })
            // try again now that some of them may be split out of the preconfigured
            .map(_.curry(utils.lookupAllTermsInFastByPrefLabel))
            .nfcall([])
            .series()
            .map(_.curry(utils.lookupAllTermsInFastByTerm))
            .nfcall([])
            .series()
            .map(_.curry(utils.lookupAllTermsInTermsByFast))
            .nfcall([])
            .series()
            .map(_.curry(utils.lookupAllTermsInTermsByTerm))
            .nfcall([])
            .series()
            .map((mmsItem) => {
              var updateTerms = []
              var updateTermsJsonCheck = []
              mmsItem.terms.forEach((term) => {
                if (term.type === 'terms:Title') return // are not doing title terms

                // add in the bnumber source to put it into the agent object
                term.source = {source: 'mmsItem', id: mmsItem._id}
                var r = utils.buildTerm(term)
                if (term.term && r.hasNewLocal === false) return
                if (!r.termControlled) return
                var rJson = JSON.stringify(r)
                if (updateTermsJsonCheck.indexOf(rJson) === -1) {
                  updateTermsJsonCheck.push(rJson)
                  updateTerms.push(r)
                }
              })
              if (updateTerms.length === 0) return ''
              process.send({ counterAdded: updateTerms.length })
              return updateTerms
            })
            .compact()
            .map(_.curry(utils.updateAllTerms)) // add/update the data to the terms collection
            .nfcall([])
            .series()
            .done((mmsItem) => {
              console.log('Done Working. #', cluster.worker.id)
              process.exit(0)
            })
        })
      }
    })

    // ask for the our assignment, the mmsDb range
    process.send({ request: true })
  }
}
