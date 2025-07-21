import Papa from 'papaparse';

self.onmessage = function(event) {
  const file = event.data;
  console.log("Worker received file:", file.name);

  Papa.parse(file, {
    worker: false, // This is key - we are already in a worker
    header: true,
    dynamicTyping: true,
    step: function(results) {
      // Send each row (or a chunk of rows) back to the main thread
      self.postMessage({ type: 'data', payload: results.data });
    },
    complete: function() {
      // Signal completion
      self.postMessage({ type: 'complete' });
      console.log("Worker finished parsing.");
    },
    error: function(error) {
      self.postMessage({ type: 'error', payload: error });
    }
  });
};