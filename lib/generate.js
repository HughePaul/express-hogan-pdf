'use strict';

const debug = require('debug')('hmpo:pdf:generate');
const Hogan = require('hogan.js');
const unmarshal = require('./unmarshal');
const PDF = require('./pdf');
const fs = require('fs');
const path = require('path');
const concat = require('concat-stream');

let generate = {
    fileToStream(filePath, locals, callback) {
        fs.readFile(filePath, (err, content) => {
            if (err) return callback(err);

            let xml;

            try {
                let fileContent = content.toString();
                debug('File XML', fileContent);
                xml = Hogan.compile(fileContent).render(locals);
                debug('Compiled XML', xml);
            } catch (e) {
                return callback(e);
            }

            unmarshal.xmlToObject(xml, (err, data) => {
                if (err) return callback(err);

                let pdf, doc;

                try {
                    pdf = new PDF(data, { basePath: path.dirname(filePath) });
                    doc = pdf.render();
                } catch (e) {
                    return callback(e);
                }

                callback(null, doc);
            });
        });
    },

    fileToBuffer(filePath, locals, callback) {
        generate.fileToStream(filePath, locals, (err, doc) => {
            if (err) return callback(err);
            doc.pipe(concat(data => {
                callback(null, data);
            }));
        });
    },

    fileToFile(filePath, locals, destFile, callback) {
        generate.fileToStream(filePath, locals, (err, doc) => {
            if (err) return callback(err);
            let stream = fs.createWriteStream(destFile);
            doc.pipe(stream);
            stream.on('finish', callback);
        });
    },

    engine(filePath, options, callback) {
        generate.fileToBuffer(filePath, options._locals, callback);
    }
};

generate.__express = generate.engine;

module.exports = generate;
