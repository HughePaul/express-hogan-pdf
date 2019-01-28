'use strict';

const debug = require('debug')('hmpo:pdf:generate');
const Hogan = require('hogan.js');
const xmlToPdf = require('xml-to-pdf');
const fs = require('fs');
const path = require('path');

const generate = {
    _cache: {},

    compile(filePath, options, callback) {
        let cached = generate._cache[filePath];
        if (options.cache && cached) return callback(null, cached);

        fs.readFile(filePath, (err, content) => {
            if (err) return callback(err);

            let compiled;

            try {
                let fileContent = content.toString();
                debug('File XML', fileContent);
                compiled = Hogan.compile(fileContent);
            } catch (e) {
                return callback(e);
            }

            if (options.cache === true) {
                generate._cache[filePath] = compiled;
            }

            callback(null, compiled);
        });
    },

    render(filePath, locals, callback) {
        generate.compile(filePath, { cache: Boolean(locals.cache) }, (err, compiled) => {
            if (err) return callback(err);

            let xml;

            try {
                xml = compiled.render(locals, locals.partials);
                debug('Compiled XML', xml);
            } catch (e) {
                return callback(e);
            }

            callback(null, xml);
        });
    },

    fileToStream(filePath, locals, callback) {
        generate.render(filePath, locals, (err, xml) => {
            if (err) return callback(err);
            xmlToPdf.toStream(xml, path.dirname(filePath), callback);
        });
    },

    fileToBuffer(filePath, locals, callback) {
        generate.render(filePath, locals, (err, xml) => {
            if (err) return callback(err);
            xmlToPdf.toBuffer(xml, path.dirname(filePath), callback);
        });
    },

    fileToFile(filePath, locals, destFile, callback) {
        generate.render(filePath, locals, (err, xml) => {
            if (err) return callback(err);
            xmlToPdf.toFile(xml, path.dirname(filePath), destFile, callback);
        });
    },

    engine(filePath, locals, callback) {
        if (locals.stream === true) {
            generate.fileToStream(filePath, locals, callback);
        } else {
            generate.fileToBuffer(filePath, locals, callback);
        }
    }
};

generate.__express = generate.engine;

module.exports = generate;
