# Change log

- 0.2.1
  - added function logLevel
  - httpServer error responses improvements

- 0.2.0
  - function initModel is renamed loadModel
  - function loadModel and Transcript  return an object containing also the processing latency
  - httpServer reviewed. The transcript endpoint return a different JSON data structure, containing latency time.

- 0.1.0 
  Added a simple HTTP sever

- 0.0.15 
  Added tests directory, containing some stress tests results

- 0.0.14 
  Transcript function updated to integrate Vosk version 0.3.25 (`npm install vosk@latest`), 
  where the function `rec.acceptWaveformAsync` now run on a separated external thread!

---

[top](#) | [home](README.md)
