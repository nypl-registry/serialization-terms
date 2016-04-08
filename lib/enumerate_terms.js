'use strict'

module.exports = function (cb) {
  var db = require('nypl-registry-utils-database')
  var crier = require('nypl-registry-utils-crier')

  var cluster = require('cluster')
  var clc = require('cli-color')
  var totalBots = 10
  var botRanges = []
  //
  // MASTER PROCESS
  //
  if (cluster.isMaster) {
    var totalDone = 0
    var totalTodo = 10000000000
    var percent = 0
    var oldPercent = -1
    var activeMessage = ''

    crier.registrySay(':vertical_traffic_light: Term Serialization - Starting Enumerate Terms.')

    // fire off a count request so we know the progress
    db.returnCollectionRegistry('terms', (err, terms) => {
      if (err) console.log(err)
      terms.count((err, count) => {
        if (err) console.log(err)
        totalTodo = count
        console.log(count)
        // split the count into ranges base on the number of bots we want
        var perBot = Math.ceil(count / totalBots)
        var start = 0
        var countBots = totalBots
        totalBots = 0
        for (var x = 1; x <= countBots; x++) {
          botRanges.push({ start: start, end: start + perBot, perBot: perBot })
          start = start + perBot
        }
        // spawn a bot for each range but wait a little so we are not dumping x number of skip requests terms collection
        botRanges.forEach((x, i) => {
          setTimeout(() => {
            spawnWorker()
            totalBots++
          }, i * 5000)
        })
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
          activeMessage = `Enumerate Terms: ${percent}% ${totalDone} Terms worked. Bots:${totalBots}`
          if (percent % 10 === 0 && percent !== oldPercent) {
            // crier.registrySay(activeMessage)
            oldPercent = percent
          }
          process.stdout.cursorTo(0)
          process.stdout.write(clc.black.bgYellowBright(activeMessage))
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

    // when the worker exists we wait a sec and see if it was the last worker, if so kill the main process == end of the script
    cluster.on('exit', (worker, code, signal) => {
      totalBots = totalBots - 1
      setTimeout(() => {
        if (Object.keys(cluster.workers).length === 0) {
          crier.registrySay(activeMessage)
          crier.registrySay(':checkered_flag: Enumerate Terms: Complete')
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
    var workStart = 0
    var workEnd = 0
    var perBot = 0
    var localCounter = 0

    // useful for debuging and restarting incase something bad happens
    var worked = false
    var workedLastOn = null
    setInterval(() => {
      if (!worked) {
        db.logError(`${cluster.worker.id} has not worked in the last few min:`, JSON.stringify(workedLastOn))
        console.log(`Going to restart worker: ${cluster.worker.id}`)
        process.send({ restart: { start: workedLastOn, end: workEnd } })
        process.exit(1)
      }
      worked = false
    }, 600000)

    var updateRegistryId = (term, callback) => {
      db.returnCollectionRegistry('terms', (err, terms) => {
        if (err) console.log(err)
        terms.update({registry: term.registry}, { $set: {registry: term.useId} }, (err, result) => {
          if (err) {
            db.logError('Term Serialization - Catalog - Cannot update/insert record:', JSON.stringify({'term': term, 'error': err}))
          }
          if (callback) callback(null, null)
        })
      })
    }

    process.on('message', (msg) => {
      if (msg.die) {
        console.log('Done Working. #', cluster.worker.id)
        process.exit(0)
      }
      if (msg.work) {
        console.log(msg.work)

        workStart = msg.work.start
        workEnd = msg.work.end
        perBot = msg.work.end - msg.work.start
        db.returnCollectionRegistry('terms', (err, terms) => {
          if (err) console.log(err)
          // this works by streaming a cursor between the two start/end range of bnumbers
          _(terms.find({}, {registry: 1}).skip(workStart))
            .map((term) => {
              if (++localCounter % 100 === 0 && localCounter !== 0) process.send({ counter: 100 })
              if (localCounter > perBot) {
                console.log('Done Working. #', cluster.worker.id)
                process.exit(0)
              }
              worked = true
              var useId = localCounter + workStart
              workedLastOn = useId
              // already has an ID
              // if (!isNaN(term.registry)) {
              //   console.log('trying to give', term.registry, 'the id', useId, 'but it has one already->', term.registryTest)
              //   return ''
              // }
              term.useId = useId + 10000000
              return term
            })
            .compact()
            .map(_.curry(updateRegistryId)) // add/update the data to the terms Components (it will filter out non viaf ones)
            .nfcall([])
            .parallel(5)
            .done((term) => {
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
