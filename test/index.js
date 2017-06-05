'use strict';

const generate = require('../lib/generate');

const xmlFile = './api-reference.pdf.xml';
const pdfFile = './api-reference.pdf';
generate.fileToFile(xmlFile, {}, pdfFile, err => {
    if (err) return console.error(err, err.stack);
});
