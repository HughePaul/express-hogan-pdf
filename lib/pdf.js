'use strict';

const PdfKit = require('pdfkit');
const _ = require('underscore');
const debug = require('debug')('hmpo:pdf:render');
const debugStyles = require('debug')('hmpo:pdf:render:styles');
const debugPosition = require('debug')('hmpo:pdf:render:position');
const debugText = require('debug')('hmpo:pdf:render:text');
const deepExtend = require('deep-extend');
const defaults = require('./defaults');
const path = require('path');

let isNum = value => typeof value === 'number' && value === value;
let isNumString = value => isNum(parseFloat(value));
let num = (value, defaultValue) => isNumString(value) ? parseFloat(value) : defaultValue || 0;

const styleKeys = {
    color: String,
    font: String,
    size: Number,
    underline: Boolean,
    strike: Boolean,
    align: String,
    lineGap: Number,
    paragraphGap: Number,
    pre: Boolean,
    trim: Boolean
};

const edgeKeys = {
    top: 'Top',
    left: 'Left',
    right: 'Right',
    bottom: 'Bottom'
};

class PDF {
    constructor(data, options) {
        this.config = deepExtend({}, defaults, options);

        this.head = _.first(data.head);
        this.pages = data.page;

        if (this.head) this.configure(this.config, this.head);
    }

    configure(root, tree) {
        if (tree.options) {
            debug('Configure', tree['#name'], tree.options);
            _.extend(root, tree.options);
        }
        _.each(tree.children, child => {
            let key = child['#name'];
            if (!root[key]) root[key] = {};
            this.configure(root[child['#name']], child);
        });
    }

    setMetaData(info, head) {
        _.each(head.title, title => {
            debug('Meta Data Title', title.textContent);
            info.Title = title.textContent;
        });
        _.each(head.meta, meta => {
            _.each(meta.children, item => {
                let key = item['#name'];
                let metaKey = key.substr(0, 1).toUpperCase() + key.substr(1);
                debug('Meta Data', metaKey, item.textContent);
                info[metaKey] = item.textContent;
            });
        });
    }

    convertEdgeOptions(options, key) {
        if (isNum(options[key])) {
            _.each(edgeKeys, optionsKey => {
                options[key + optionsKey] = num(options[key + optionsKey], options[key]);
            });
            delete options[key];
        }
    }

    cleanTagStyle(options) {
        if (options.color) options.color = this.config.colors[options.color] || options.color;
        if (options.backgroundColor) options.backgroundColor = this.config.colors[options.backgroundColor] || options.backgroundColor;
        if (options.font) {
            options.font = this.config.fonts[options.font] || options.font;
            if (options.font.indexOf('/') >= 0) options.font = path.resolve(this.config.basePath, options.font);
        }

        this.convertEdgeOptions(options, 'padding');
        this.convertEdgeOptions(options, 'margin');
    }

    getTagOptions(tagName, options) {
        let styles = [];
        let extendStyle = tag => {
            if (_.contains(styles, tag)) return;
            styles.push(tag);
            if (!options.behaviour && this[tag + 'Tag']) options.behaviour = tag;
            debugStyles('Extending tag options', tagName, tag);
            let tagStyle = this.config.styles[tag];
            if (!tagStyle) throw new Error('Style not found for ' + tag);
            this.cleanTagStyle(tagStyle);
            options = _.defaults(options, tagStyle);
            if (tagStyle.extends) extendStyle(tagStyle.extends);
        };

        options = options || {};
        this.cleanTagStyle(options);
        if (options.style) extendStyle(options.style);

        extendStyle(tagName);

        extendStyle('*');

        debugStyles('Built tag options', tagName, styles, options);

        return options;
    }

    getOptionalPercentageValue(val, total) {
        if (typeof val === 'string' && val.endsWith('%')) {
            return num(val) / 100 * num(total, 1);
        }
        return num(val);
    }

    getTagPosition(state, options) {
        let left = options.display === 'block' ? state.left : state.doc.x;

        let position = {
            top: state.doc.y + options.marginTop,
            left: left + options.marginLeft,
            right: state.right + options.marginRight,
            width: null,
            height: null
        };

        if (isNumString(options.width)) {
            let availableWidth = state.width - options.marginLeft - options.marginRight;
            position.width = this.getOptionalPercentageValue(options.width, availableWidth);

            position.right = state.pageWidth - position.left - position.width;
        }

        if (isNumString(options.height)) {
            position.height = this.getOptionalPercentageValue(options.height, state.pageHeight);
        }

        if (isNumString(options.left)) {
            position.left = this.getOptionalPercentageValue(options.left, state.pageWidth);
        }

        if (isNumString(options.right) && isNum(position.width)) {
            position.right = this.getOptionalPercentageValue(options.right, state.pageWidth);
            position.left = state.pageWidth - position.right - position.width;
        }

        if (isNumString(options.top)) {
            position.top = this.getOptionalPercentageValue(options.top, state.pageHeight);
        }
        if (isNumString(options.bottom)) {
            position.bottom = this.getOptionalPercentageValue(options.bottom, state.pageHeight);
            if (isNum(position.top)) {
                position.height = position.bottom - position.top;
            } else if (isNum(position.height)) {
                position.top = position.bottom - position.height;
            }
        }

        if (!isNum(position.width && isNum(position.left) && isNum(position.right))) {
            position.width = state.pageWidth - position.left - position.right;
        }

        debugPosition('Tag', state.path, position, { parentLeft: state.left, parentRight: state.right });
        return position;
    }

    pushState(state) {
        let oldState = _.omit(state, (val, key) => Object.getOwnPropertyDescriptor(state, key).get);
        oldState.style = _.extend({}, state.style),
        state.stack.push(oldState);
        state.parentPath = state.path;
        state.parentLeft = state.left;
        state.parentRight = state.right;
        state.parentWidth = state.width;
    }

    popState(state) {
        let popped = state.stack.pop();
        if (!popped) return;
        _.extend(state, popped);
        _.each(_.difference(_.keys(popped), _.keys(state)), key => delete state[key]);
    }

    render() {
        debug('Rendering document');

        let doc = new PdfKit(this.config.document);

        this.setMetaData(doc.info, this.head);

        let stack = [];
        let state = {
            get stack() { return stack; },
            get doc() { return doc; },
            get top() { return state.marginTop; },
            get bottom() { return state.marginBottom; },
            get left() { return doc.page && doc.page.margins.left; },
            get right() { return doc.page && doc.page.margins.right; },
            get width() { return state.pageWidth - state.left - state.right; },
            set left(v) {
                if (doc.page.margins.left === v) return;
                if (!v) v = state.marginLeft;
                doc.page.margins.left = v;
            },
            set right(v) {
                if (doc.page.margins.right === v) return;
                if (!v) v = state._marginRight;
                doc.page.margins.right = v;
            },
            set width(v) {
                if (state.width === v) return;
                if (!v) return state.left = state.right = 0;
                state.right = state.pageWidth - state.left - v;
            },
        };

        // render pages tag
        try {
            _.each(this.pages, (page, index) => {
                state.path = 'pdf.page(' + (index + 1) + ')';
                state.style = _.extend({}, this.config.styles.p);
                this.page(state, page.options, page.children);
            });
        } catch (e) {
            e.path = state.path;
            e.message = e.path + ': ' + e.message;
            throw e;
        }

        doc.end();

        return doc;
    }

    page(state, options, children) {
        options = deepExtend({}, this.config.document, options);

        _.each(edgeKeys, (optionsKey, pageKey) => {
            if (isNum(options['margin' + optionsKey])) options.margin[pageKey] = options[optionsKey];
        });

        debug('Page added', state.path, options);

        state.doc.addPage(options);

        _.each(edgeKeys, (optionsKey, pageKey) => {
            state['margin' + optionsKey] = num(state.doc.page.margins[pageKey]);
        });

        state.pageWidth = state.doc.page.width;
        state.pageHeight = state.doc.page.height;
        state.doc.x = state.left;
        state.doc.y = state.top;

        this.renderChildren(state, children);
    }

    renderChildren(state, children) {
        if (!children) return;

        debug('Rendering children of', state.path);
        let indexes = {};

        _.each(children, child => {
            this.pushState(state);

            let tag = child['#name'];

            if (tag === '__text__') {
                this.text(state, child.textContent);
            } else {
                let index = indexes[tag] = (indexes[tag] || 0) + 1;
                state.path = state.parentPath + '.' + tag + '(' + index + ')';
                this.tag(state, tag, child.options, child.children, child.textContent);
            }

            this.popState(state);
        });

    }

    tag(state, tag, options, children, textContent) {
        debug('Rendering tag', state.path);

        options = this.getTagOptions(tag, options);

        _.each(styleKeys, (type, key) => {
            if (type === Number && isNum(options[key])) state.style[key] = options[key];
            if (type === Boolean && options[key] !== undefined) state.style[key] = Boolean(options[key]);
            if (type === String && options[key] !== undefined) state.style[key] = String(options[key]);
        });

        options.pos = this.getTagPosition(state, options);

        debugStyles('Rendering tag with options', state.path, options);

        state.doc.y = options.pos.top;
        state.doc.x = options.pos.left;
        if (options.display === 'block') {
            state.left = options.pos.left;
            state.right = options.pos.right;
        }

        let fn = this[options.behaviour + 'Tag'] || this.genericTag;
        fn.call(this, state, options, children, textContent);

        // end block of text
        if ((options.display === 'block') && (state.continued)) {
            state.doc.text(' ', { link: false, continued: false });
            state.continued = false;
        }

        // draw box around tag
        if (this.config.debug) {
            state.doc.rect(
                options.pos.left,
                options.pos.top,
                state.pageWidth - options.pos.right - options.pos.left,
                state.doc.y - options.pos.top).stroke((options.display === 'block') ? '#f77' : '#7f7');
        }

        if (options.display === 'block') {
            state.doc.x = state.parentLeft;
            state.doc.y += num(options.marginBottom);
        } else {
            state.doc.x += num(options.marginRight);
        }
    }

    hrTag(state, options) {
        state.doc.rect(state.doc.x, state.doc.y, options.pos.width, num(options.thickness)).fill(options.color);
        state.doc.y += options.thickness;
    }

    imgTag(state, options) {
        let imgOptions = {};
        if (options.pos.width) imgOptions.width = options.pos.width;
        if (options.height) imgOptions.height = options.height;
        if (options.scale) {
            imgOptions.scale = this.getOptionalPercentageValue(options.scale);
        }
        if (options.fit && imgOptions.width && imgOptions.height) {
            imgOptions.fit = [ imgOptions.width, imgOptions.height ];
            delete imgOptions.width;
            delete imgOptions.height;
        }
        state.doc.image(path.resolve(this.config.basePath, options.src), state.doc.x, state.doc.y, imgOptions);
    }

    indentTag(state, options, children) {
        state.left += options.paddingLeft;
        state.doc.x = state.left;

        this.renderChildren(state, children);

        let height = state.doc.y - options.pos.top;
        if (options.thickness && options.color) {
            state.doc.rect(options.pos.left, options.pos.top, options.thickness, height).fill(options.color);
        }
    }

    rowTag(state, options, children) {
        let OldColumns = state.columns;
        state.columns = {
            top: options.pos.top,
            next: options.pos.left
        };

        this.genericTag(state, options, children);

        state.columns = OldColumns;
    }

    columnTag(state, options, children) {
        let cols = state.columns;
        if (!cols) throw new Error('<column> tag must be within a <row> tag');

        let left = cols.next + options.marginLeft;

        debug('New Column', state.path, {next: cols.next, top: cols.top, left });

        // wrap columns
        let columnOverflow = (left + options.pos.width) - (state.parentLeft + state.parentWidth);
        if (cols.bottom && columnOverflow > 0 && columnOverflow < state.parentWidth) {
            debug('Wrapping column', state.path, columnOverflow);
            left = state.parentLeft + options.marginLeft;
            cols.top = cols.bottom;
            cols.bottom = 0;
        }

        state.doc.y = cols.top + options.marginTop + options.paddingTop;
        state.doc.x = state.left = left + options.paddingLeft;
        state.width = options.pos.width - options.paddingRight;

        debug('Column', state.path, {x: state.doc.x, y: state.doc.y, left: state.left, width: state.width });
        this.renderChildren(state, children);

        state.doc.y += options.paddingBottom + options.marginBottom;
        cols.next = left + options.pos.width + options.marginRight;
        cols.bottom = Math.max(cols.bottom || 0, state.doc.y);
        state.doc.y = cols.bottom - options.marginBottom;
    }

    aTag(state, options, children, textContent) {
        options.href = options.href || textContent || '';
        if (!options.href.startsWith('http')) {
            options.href = 'https://' + options.href;
        }
        state.link = options.href;

        this.genericTag(state, options, children);
    }

    genericTag(state, options, children) {
        if (options.display === 'block') {
            if (options.backgroundColor && options.pos.width && options.pos.height) {
                debug('Tag background', state.path, {
                    left: options.pos.left,
                    top: options.pos.top,
                    width: options.pos.width,
                    height: options.pos.height,
                    color: options.backgroundColor
                });
                state.doc.rect(
                    options.pos.left,
                    options.pos.top,
                    options.pos.width,
                    options.pos.height
                ).fill(options.backgroundColor);
            }

            state.doc.y += options.paddingTop;
            state.left += options.paddingLeft;
            state.right += options.paddingRight;
        } else {
            state.doc.x += options.paddingLeft;
        }

        this.renderChildren(state, children);

        if (options.display === 'block') {
            if (isNum(options.pos.height)) {
                state.doc.y = options.pos.top + options.pos.height;
            } else {
                state.doc.y += options.paddingBottom;
                options.pos.height = state.doc.y - options.pos.top;
            }

            if (options.border) {
                debug('Tag Border', state.path, {
                    left: options.pos.left,
                    top: options.pos.top,
                    width: options.pos.width,
                    height: options.pos.height,
                    border: options.border,
                    borderColor: options.borderColor
                });
                let rect = state.doc.rect(
                    options.pos.left,
                    options.pos.top,
                    options.pos.width,
                    options.pos.height
                );
                if (isNum(options.border)) rect.lineWidth(options.border);
                if (options.borderColor) rect.strokeColor(options.borderColor);
                rect.stroke();
            }

        } else {
            state.doc.x += options.paddingRight;
        }

    }

    text(state, textContent) {
        if (typeof textContent === 'number') textContent = String(textContent);
        if (typeof textContent !== 'string') return;

        if (state.style.trim) {
            textContent = textContent.replace(/^\s+/mg, '');
        }
        if (!state.style.pre) {
            textContent = textContent.replace(/[\n\s]+/g, ' ');
        }

        let options = _.extend({ continued: true }, state.style);
        if (state.link) options.link = state.link;

        debugText('Rendering text',
            textContent,
            {
                path: state.path,
                x: state.doc.x,
                y: state.doc.y,
                options: options
            }
        );

        state.doc
            .fill(state.style.color)
            .font(state.style.font)
            .fontSize(state.style.size)
            .text(textContent, state.doc.x, state.doc.y, options);

        state.continued = true;
    }

}

module.exports = PDF;
