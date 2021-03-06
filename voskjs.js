#!/usr/bin/env node

/**
 * @module voskjs 
 *
 * @public
 * @function logLevel
 * @function loadModel
 * @function transcript
 * @function freeModel
 *
-* @see VoskAPI https://github.com/alphacep/vosk-api/blob/master/nodejs/index.js
 */

const fs = require('fs')
const { Readable } = require('stream')

const wav = require('wav')
const vosk = require('vosk')

const { info } = require('./lib/info')
const { getArgs } = require('./lib/getArgs')
const { setTimer, getTimer } = require('./lib/chronos')


/**
 * @constant
 */
const SAMPLE_RATE = 16000


function helpAndExit() {
  console.log('voskjs is a CLI utility to test Vosk-api features')
  console.log (info())
  console.log()
  console.log('Usage')
  console.log()
  console.log('  voskjs \\ ')
  console.log('    --model=<model directory> \\ ')
  console.log('    --audio=<audio file name> \\ ')
  console.log('    [--grammar=<list of comma-separated words or sentences>] \\ ')
  console.log('    [--samplerate=<Number, usually 16000 or 8000>] \\ ')
  console.log('    [--alternatives=<number of max alternatives in text result>] ')
  console.log('    [--debug=<Vosk debug level>] ')
  console.log()    
  console.log('Examples')
  console.log()
  console.log('  1. Recognize a speech file using a specific model directory:')
  console.log()
  console.log('     voskjs --audio=audio/2830-3980-0043.wav --model=models/vosk-model-en-us-aspire-0.2')
  console.log()
  console.log('  2. Recognize a speech file setting a grammar (with a dynamic graph model) and a number of alternative:')
  console.log()
  console.log('     voskjs \\ ')
  console.log('       --audio=audio/2830-3980-0043.wav \\ ')
  console.log('       --model=models/vosk-model-small-en-us-0.15 \\ ')
  console.log('       --grammar="experience proves this, bla bla bla"')
  console.log('       --alternatives=3')
  console.log()
  process.exit(1)
}  


/**
 * @function logLevel
 * @public
 * Set log level for Vosk/Kaldi log messages
 *
 * @param {number} level   The higher, the more verbose. 0 for infos and errors. Less than 0 for silence. 
 */
function logLevel(level=0) {

  // set vosk log level
  vosk.setLogLevel(level)

}  


/**
 * @function loadModel 
 * Create a run time model from the specified directory 
 *
 * @public
 *
 * @param {String}       modelDirectory directory name of the Vosk model
 *
 * @typedef ModelObject
 * @property {VoskModel} model          run time model object returned by Vosk engine.
 * @property {Number}    latency        elpased time in msecs
 *
 * @return {promise<ModelObject>}
 *
 */ 
function loadModel(modelDirectory) {

  // check if model directory exists, async
  fs.access(modelDirectory, (err) => {
    if (err) 
      throw `${err}: file ${modelDirectory} not found.`
  })
  
  // create new run time model from the specified directory 
  // TODO try/catch?
  const model = new vosk.Model(modelDirectory)

  return model 

}  


/**
 * @function createRecognizer 
 *
 * Create a run time Vosk recognizer 
 *
 * @typedef VoskRecognizerArgsObject
 * @property {Boolean}                 multiThreads if true, an external (Vosk engine) thread is spawned on the fly
 *                                                  that need in server (concurrent requests) architecture.
 * @property {Number}                  sampleRate   Default value: 16000
 * @property {String[]}                grammar      array of words, or sentences
 * @property {Number}                  alternatives maximum alternatives to return from recognition results
 *
 * @param {ModelObject}                model        the Vosk model returned by InitModel()
 * @param {VoskRecognizerArgsObject}  [options]     Vosk Recognizer arguments setting. Optional
 * @return {VoskRecognizerObject}
 *
 */ 
function createRecognizer(model, { sampleRate=SAMPLE_RATE, grammar=null, alternatives=0 } = {}) {

  // if a grammar is specified, pass it to the Vosk Recognizer
  const voskRecognizerArgs = grammar ? 
    {model, sampleRate, grammar} :
    {model, sampleRate}

  // create Vosk recognizer
  // TODO try/catch?
  const recognizer = new vosk.Recognizer(voskRecognizerArgs)

  // 
  if ( alternatives )
    recognizer.setMaxAlternatives(alternatives)

  return recognizer
}


/**
 * @function transcriptFromFile
 * speech recognition into a text, from an audio file, given a specified Vosk model
 *
 * @alias transcript
 * @public
 * @async
 *
 * @param {String}                     fileName     the name of speech file, in WAV format
 * @param {ModelObject}                model        the Vosk model returned by InitModel()
 * @param {VoskRecognizerArgsObject}   [options]    Vosk Recognizer arguments setting. Optional. 
 *
 * @return {Promise<VoskResultObject>} transcript object returned by Vosk engine
 *
 */ 
async function transcriptFromFile(fileName, model, { multiThreads=true, sampleRate=SAMPLE_RATE, grammar=null, alternatives=0 } = {}) {

  const DEBUG = true

  return new Promise( (resolve, reject) => {

    // validate audiofile existence, async
    fs.access(fileName, (err) => {
      if (err) 
        return reject(`${err}: file ${fileName} not found.`)
    })

    if (DEBUG)
      setTimer('createRecognizer')

    const recognizer = createRecognizer(model, {sampleRate, grammar, alternatives})

    if (DEBUG)
      console.log(`recognizer latency   : ${getTimer('createRecognizer')}ms`)

    const wfStream = fs.createReadStream(fileName, {'highWaterMark': 4096})
    const wfReader = new wav.Reader()
    
    wfStream.pipe(wfReader)
    
    const pcmChunks = new Readable().wrap(wfReader)

    wfReader.on('format', async ( { audioFormat, sampleRate, channels } ) => {
        
      if (audioFormat != 1 || channels != 1)
        return reject(`${fileName}: audio file (sample rate: ${sampleRate}) must be WAV format mono PCM.`)


      for await (const data of pcmChunks) {

        //
        // WARNING
        // From vosk version 0.3.25
        // the acceptWaveformAsync function runs in a dedicated thread.
        // That wold improve performances in case of cocurrent requests 
        // from the caller (server) program  
        //
        // Previous vosk version 0.3.25
        // const end_of_speech = recognizer.acceptWaveform(data)
        //
        const end_of_speech = multiThreads ? 
          await recognizer.acceptWaveformAsync(data) : 
          recognizer.acceptWaveform(data)

        if (end_of_speech) {
          console.log(recognizer.result())
        }
      
      }

      // copy final Vosk engine result object
      const result = {...recognizer.finalResult(recognizer)} 

      recognizer.free()
      
      return resolve(result)

    })
  })

}


/**
 * @function transcriptFromBuffer
 * speech recognition into a text, from an audio file, given a specified Vosk model
 *
 * @alias transcript
 * @public
 * @async
 *
 * @param {Buffer}                     buffer       input buffer, in PCM format
 * @param {ModelObject}                model        the Vosk model returned by InitModel()
 * @param {VoskRecognizerArgsObject}   [options]    Vosk Recognizer arguments setting. Optional. 
 *
 * @return {Promise<VoskResultObject>} transcript object returned by Vosk engine
 *
 */ 
async function transcriptFromBuffer(buffer, model, { multiThreads=true, sampleRate=SAMPLE_RATE, grammar=null, alternatives=0 } = {}) {

  const recognizer = createRecognizer(model, {sampleRate, grammar, alternatives})
   
  // https://gist.github.com/wpscholar/270005d42b860b1c33cf5ab25b37928a
  // https://stackoverflow.com/questions/47089230/how-to-convert-buffer-to-stream-in-nodejs
  
  //
  // WARNING
  // From vosk version 0.3.25
  // the acceptWaveformAsync function runs in a dedicated thread.
  // That wold improve performances in case of cocurrent requests 
  // from the caller (server) program  
  //
  // Previous vosk version 0.3.25
  // const end_of_speech = recognizer.acceptWaveform(data)
  //
  if ( multiThreads ) 
    await recognizer.acceptWaveformAsync(buffer)
  else
    recognizer.acceptWaveform(buffer)

  // copy final Vosk engine result object
  const result = {...recognizer.finalResult(recognizer)} 

  recognizer.free()
    
  return Promise.resolve(result)

}


/**
 * @function freeModel
 * @public
 *
 * @param {ModelObject} model
 *
 */ 
function freeModel(model) {
  model.free()
}  


/**
 * test section
 */

/**
 * @function checkArgs
 * command line parsing
 *
 * @param {String}    args
 *
 * @typedef {Object}  SentenceAndAttributes
 * @property {String} language 
 * @returns {SentenceAndAttributes}
 * 
 */
function checkArgs(args) {

  const modelDirectory = args.model 
  const audioFile = args.audio 
  const grammar = args.grammar 
  const sampleRate = args.samplerate 
  const alternatives = args.alternatives 

  // if not specified, set default Vosk debug level to -1 (silent mode)
  const debug = args.debug ? args.debug : -1

  if ( !modelDirectory ) 
    helpAndExit()

  if ( !audioFile ) 
    helpAndExit()

  return { 
    modelDirectory, 
    audioFile, 

    // if grammar args is present, as comma separated sentences,
    // convert it in an array of strings
    grammar: grammar ? grammar.split(',').map(sentence => sentence.trim()) : undefined, 

    // convert to Number
    sampleRate: sampleRate ? +sampleRate : undefined,

    alternatives,
    debug
  }
}


/**
 * @function main
 * unit test
 */
async function main() {

  // get command line arguments 
  const { args } = getArgs()
  const { modelDirectory, audioFile, grammar, sampleRate, alternatives, debug } = checkArgs(args)

  info()
  console.log()
  console.log(`model directory      : ${modelDirectory}`)
  console.log(`speech file name     : ${audioFile}`)
  console.log(`grammar              : ${grammar ? grammar : 'not specified. Default: NO'}`)
  console.log(`sample rate          : ${sampleRate ? sampleRate : 'not specified. Default: 16000'}`)
  console.log(`max alternatives     : ${alternatives}`)
  console.log(`Vosk debug level     : ${debug}`)
  console.log()

  // set the vosk log level to silence 
  logLevel(debug) 

  setTimer('loadModel')

  // load in memory a Vosk directory model
  const model = loadModel(modelDirectory)

  console.log(`load model latency   : ${getTimer('loadModel')}ms`)
  console.log()

  // speech recognition from an audio file
  try {
    setTimer('transcript')

    const result = await transcriptFromFile(audioFile, model, {grammar, sampleRate, alternatives})

    console.log(result)
    console.log()
    console.log(`transcript latency : ${getTimer('transcript')}ms`)
    console.log()
  }  
  catch(error) {
    console.error(error) 
  }  

  // free the runtime model
  freeModel(model)

}


if (require.main === module) 
  main()

module.exports = { 
  logLevel,
  loadModel,
  transcriptFromBuffer,
  transcriptFromFile,
  transcript: transcriptFromFile, // alias
  freeModel
}

