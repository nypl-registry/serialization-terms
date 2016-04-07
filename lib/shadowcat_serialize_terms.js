'use strict'

module.exports = function shadowcatSerializeViafAgents (cb) {
  var db = require('nypl-registry-utils-database')
  var cluster = require('cluster')
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
    var totalTermsAdded = 0
    var percent = 0
    var oldPercent = -1
    var activeMessage = ''

    // finds the counts in the bib records and split it up among the number of requested bots
    var findBibSplit = (splitCount, callback) => {
      db.returnCollectionShadowcat('bib', (err, bibs) => {
        if (err) console.log(err)
        bibs.find({}, {_id: 1}).sort({_id: 1}).limit(1).toArray((err, resultsMin) => {
          if (err) console.log(err)
          bibs.find({}, {_id: 1}).sort({_id: -1}).limit(1).toArray((err, resultsMax) => {
            if (err) console.log(err)
            var minBnumber = resultsMin[0]._id
            var maxBnumber = resultsMax[0]._id
            callback(utils.returnDistributedArray(maxBnumber, minBnumber, splitCount))
          })
        })
      })
    }

    // fire off a count request so we know the progress
    db.returnCollectionShadowcat('bib', (err, bibs) => {
      if (err) console.log(err)
      bibs.count((err, count) => {
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
          activeMessage = `Shadowcat Terms Serialization: ${percent}% ${totalDone} Bibs worked. Terms procssed: ${totalTermsAdded} Bots:${totalBots}`
          if (percent % 5 === 0 && percent !== oldPercent) {
            // crier.registrySay(activeMessage)
            oldPercent = percent
          }
          process.stdout.cursorTo(0)
          process.stdout.write(clc.black.bgYellowBright(activeMessage))
        }
        if (msg.counterAdded) {
          totalTermsAdded = totalTermsAdded + msg.counterAdded
        }

        if (msg.restart) {
          console.log('Restarting this range:', msg.restart)
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
          // crier.registrySay(activeMessage)
          // crier.registrySay(':checkered_flag: Shadowcat VIAF Agent Serialization: Complete')
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

    var _ = require('highland')
    // keep track of what we are working on incase we need to ask the master process to restart the worker
    var bibStart = 0
    var bibEnd = 0
    var localCounter = 0
    // useful for debuging and restarting incase something bad happens
    var worked = false
    var workedLastOn = null
    setInterval(() => {
      if (!worked) {
        // console.log(`${cluster.worker.id} has not worked in the last few min:`, workedLastOn)
        db.logError(`${cluster.worker.id} has not worked in the last few min:`, JSON.stringify(workedLastOn))
        console.log(`Going to restart worker: ${cluster.worker.id}`)
        process.send({ restart: { start: bibStart, end: bibEnd } })
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
        console.log(msg.work)
        bibStart = msg.work.start
        bibEnd = msg.work.end
        db.returnCollectionShadowcat('bib', (err, bibs) => {
          if (err) console.log(err)
          // this works by streaming a cursor between the two start/end range of bnumbers
          _(bibs.find({$and: [{_id: {$gte: msg.work.start}}, {_id: {$lt: msg.work.end}}]}, {'sc:terms': 1, 'sc:research': 1}))
            .map((bib) => {
              // we are using generic functions so make it consistent
              bib.terms = bib['sc:terms']

              // for debuging
              worked = true
              workedLastOn = bib

              // keep track of where we are
              bibStart = bib._id

              // ++ the counter
              if (++localCounter % 100 === 0 && localCounter !== 0) process.send({ counter: 100 })

              // filter out non research stuff
              if (!bib['sc:research']) return ''
              if (!bib.terms) return ''
              // filter out if no agents
              if (bib.terms.length === 0) return ''
              return bib
            })
            .compact()
            .map(_.curry(utils.lookupAllTermsInFastByFast))
            .nfcall([])
            .series()
            .map(_.curry(utils.lookupAllTermsInFastByPrefLabel))
            .nfcall([])
            .series()
            .map(_.curry(utils.lookupAllTermsInFastByLcId))
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
            .map((bib) => {
              var updateTerms = []
              var updateTermsJsonCheck = []
              // we have all the data we need to make a new agent if needed
              bib.terms.forEach((term) => {
                if (term.type === 'terms:Title') return // are not doing title terms
                // add in the bnumber source to put it into the agent object
                term.source = {source: 'shadowcat', id: bib._id}
                var r = utils.buildTerm(term)
                if (!r.termControlled) return

                // see if all the normalized terms are in the existing agent, if not we want to update them
                if (term.term) {
                  if (term.term.termNormalized.length === r.termNormalized.length) return
                }

                var rJson = JSON.stringify(r)
                if (updateTermsJsonCheck.indexOf(rJson) === -1) {
                  updateTermsJsonCheck.push(rJson)
                  updateTerms.push(r)
                }
              })
              process.send({ counterAdded: updateTerms.length })
              return updateTerms
            })
            .map(_.curry(utils.updateAllTerms)) // add/update the data to the terms collection
            .nfcall([])
            .series()
            .done((bib) => {
              console.log('Done')
              console.log('Done Working. #', cluster.worker.id)
              process.exit(0)
            })
        })
      }
    })

    // ask for the our assignment, the bnumber range
    process.send({ request: true })
  }
}
