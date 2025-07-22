import Papa from 'papaparse';

self.onmessage = function(event) {
    const { file, preview } = event.data;
    const isPreview = !!preview;
    let rowCount = 0;
    const PREVIEW_ROWS = 10;

    console.log(`Worker received file: ${file.name}, preview: ${isPreview}`);

    Papa.parse(file, {
        worker: false,
        header: true,
        dynamicTyping: true,
        step: function(results, parser) {
            rowCount++;
            self.postMessage({ type: 'data', payload: [results.data] });
            
            if (isPreview && rowCount >= PREVIEW_ROWS) {
                parser.abort();
                self.postMessage({ type: 'complete' });
                console.log(`Worker finished preview after ${PREVIEW_ROWS} rows.`);
            }
        },
        complete: function() {
            self.postMessage({ type: 'complete' });
            console.log("Worker finished full parse.");
        },
        error: function(error) {
            self.postMessage({ type: 'error', payload: error });
        }
    });
};