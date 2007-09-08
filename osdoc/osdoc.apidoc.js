/*
 * Author: Oliver Steele
 * Copyright: Copyright 2007 by Oliver Steele.  All rights reserved.
 * License: MIT License
 * Source: http://osteele.com/javascripts/osdoc
 * Created: 2007-07-11
 * Modified: 2007-07-21
 *
 * Pre-release version; not ready for prime time.
 */

/**
 * Options:
 *   all: include undocumented elements
 *   headingLevel: hn for topmost headings; default 3
 *   staged: render incrementally if true
 *   target: an HTML Element that is set to the docs on completion
 *   onSuccess: called when load completes
 */
OSDoc.APIDoc = function(options) {
    this.options = {headingLevel: 3,
                    staged: true,
                    onSuccess: Functional.I};
    for (var name in options||{})
        this.options[name] = options[name];
};

/// Load +url+ and parse its contents.
OSDoc.APIDoc.prototype.load = function(url) {
    this.options.target && (this.options.target.innerHTML = OSDoc.loadingHeader);
    new Ajax.Request(
        url+'?ts='+new Date().getTime(),
        {method: 'GET',
         onSuccess: Functional.compose(this.parse.bind(this), '_.responseText').reporting()});
    return this;
}

/// Parse +text+.  If +options.target+ is specified, update it.
OSDoc.APIDoc.prototype.parse = function(text) {
    gf = this.parse.bind(this, text);
    this.text = OSDoc.stripHeader(text);
    this.updateTarget(this.options.staged && 0);
    return this;
}

OSDoc.APIDoc.prototype.updateTarget = function(stage) {
    if (!this.options.target) return;
    var model = new OSDoc.APIDoc.Parser().parse(this.text);
    info(new StandardFormatter().render(model));

    //this.options.target.innerHTML = new StandardFormatter().render(model);
    return;

    var text = this.text;
    switch (stage) {
    case 0:
        this.options.target.innerHTML = OSDoc.previewText(text);
        break;
    case 1:
        this.records = this.records || new OSDoc.APIDoc.Parser(this.options).parse(text);
        this.options.target.innerHTML = OSDoc.processingHeader + this.toHTML(true);
        break;
    default:
        this.records = this.records || (new OSDoc.APIDoc.Parser).parse(text);
        this.options.target.innerHTML = this.toHTML();
        this.options.onSuccess();
        return this;
    }
    this.updateTarget.bind(this).saturate(stage+1).delayed(10);
    return this;
}

OSDoc.APIDoc.prototype.toHTML = function(fast) {
    var spans = [];
    var self = this;
    this.records.each(function(rec) {
        spans.push(rec.toHTML(fast).replace(/(<\/?h)(\d)([\s>])/g, function(_, left, n, right) {
            return [left, n.charCodeAt(0) - 49 + self.options.headingLevel, right].join('');
        }));
    });
    return spans.join('\n');
}

OSDoc.APIDoc.Definition = function(name, params) {
    this.target = this.params = null;
    this.paramTable = {};
    var match;
    if (match = name.match(/(.*\.)(\w+)/)) {
        name = match[2];
        this.target = match[1];
    }
    this.name = name;
    if (typeof params == 'string') {
        params = params.replace(/\/\*(.*?)\*\//g, '$1');
        this.params = params.replace(/\.\.\./g, '&hellip;');
        var table = this.paramTable;
        this.params.scan(/\w+/, function(name) {
            table[name] = true;
        });
    }
    this.tests = [];
    this.blocks = [];
}

OSDoc.APIDoc.Definition.prototype.setDescription = function(lines) {
    this.block = null;
    while (lines.length && lines[lines.length-1].match(/^\s*$/))
        lines.pop();
    map(this.addDescriptionLine, lines, this);
}

OSDoc.APIDoc.Definition.prototype.addDescriptionLine = function(line) {
    var blocks = this.blocks;
    var block = this.block;
    var self = this;
    var rules =
        [[/\s*::\s*(.*)/, type],
         [/^>>\s*(.*)/, output],
         [/^==\s*(.*)/, defn],
         [/^\s+(.*)/, indented],
         [/^\s*$/, endParagraph],
         [/(.*)/, para]];
    for (var i = 0; i < rules.length; i++) {
        var item = rules[i];
        var match;
        if (match = line.match(item[0])) {
            item[1].apply(this, [].slice.call(match, 1));
            break;
        }
    }

    // line type handlers (some also add)
    function type(text) {
        this.signature = text;
    }
    function output(text) {
        endParagraph();
        var match = text.match(/\s*(.*)\s*->\s*(.*?)\s*$/);
        var input = match ? match[1].replace(/\s+$/,'') : text;
        var output = match && match[2];
        var test = (match
                    ? {text: input, expect: output}
                    : {text: input});
        self.tests.push(test);
        var line = (match
                    ? ['<kbd>', input.escapeHTML(), '</kbd>',
                       ' <samp>&rarr; ', output.escapeHTML(), '</samp>'].join('')
                    : '<kbd>' + text.escapeHTML() + '</kbd>');
        addLine('<div class="io">'+line+'<div class="clear"> </div></div>');
    }
    function defn(text) {
        endParagraph();
        var html = OSDoc.toMathHTML(text).replace(/==/, '=<sub class="def">def</sub> ')
        blocks.push('<pre class="equivalence">' + html + '</pre>');
    }
    function indented(line) {
        endParagraph();
        pre(line.escapeHTML());
    }
    function para(line) {
        block || blocks.push(this.block = block = []);
        block.push(line);
    }
    // adders
    function endParagraph() {
        self.block = null;
    }
    function pre(line) {
        addLine('<pre>&nbsp;&nbsp;' + line + '</pre>');
    }
    function addLine(line) {
        var prev = blocks[blocks.length - 1];
        var match;
        if (typeof prev == 'string' && (match = prev.match(/<pre>(.*)<\/pre>/)))
            return blocks[blocks.length-1] = '<pre>' + match[1] + '\n&nbsp;&nbsp;' + line + '</pre>';
        blocks.push(line);
    }
}

OSDoc.APIDoc.Definition.prototype.toHTML = function(fast) {
    var isFunction = this.params != null;
    var spans = [];

    spans.push('<div class="record">');
    signature.call(this);
    type.call(this);
    description.call(this);
    spans.push('</div>');
    return spans.join('');

    function signature() {
        spans.push('<div class="signature">');
        isFunction || spans.push('var ');
        this.target && spans.push('<span class="target">' + this.target + '</span>');
        spans.push('<span class="name">' + this.name + '</span>');
        isFunction
            ? spans.push('(<var>' + this.params + '</var>)')
            : spans.push(';');
        spans.push('</div>');
    }
    function type() {
        if (this.signature) {
            var text = this.signature.escapeHTML();
            if (!fast) {
                text = text.replace(/-&gt;/g, '&rarr;').replace(/\.\.\./g, '&hellip;');
                text = text.replace(/(?:(\d+)|_{(.*?)})/g, function(_, sub, sub2) {
                    return '<sub>'+(sub||sub2)+'</sub>';
                });
            }
            spans.push('<div class="type"><span class="label">Type:</span> '+text+'</div>');
        }
    }
    function description() {
        spans.push(this.getDescriptionHTML(fast));
    }
}

OSDoc.APIDoc.Definition.prototype.getDescriptionHTML = function(fast) {
    var spans = [];
    var paramTable = this.paramTable;
    var paras = this.blocks.select(pluck('length')).map(function(block) {
        // it may have already been formatted:
        if (typeof block == 'string') return block;
        var lines = ['<div>'].concat(block);
        lines.push('</div>');
        var html = lines.join(' ');
        if (!fast) html = OSDoc.inlineFormat(html, paramTable);
        return html;
    }.bind(this));
    spans.push('<div class="description">');
    spans = spans.concat(paras);
    spans.push('</div>');
    return spans.join('');
 }

OSDoc.APIDoc.Section = function(title, level, lines) {
    this.tests = [];
    this.blocks = [];
    this.paramTable = {};
    this.addDescriptionLine = OSDoc.APIDoc.Definition.prototype.addDescriptionLine;
    OSDoc.APIDoc.Definition.prototype.setDescription.call(this, lines);
    var tagName = 'h' + level;
    var html = ['<', tagName, '>', title, '</', tagName, '>'].join('');
    html += OSDoc.APIDoc.Definition.prototype.getDescriptionHTML.call(this);
    this.toHTML = Functional.K(html);
}

OSDoc.APIDoc.Parser = function(options) {
    this.options = options;
}

OSDoc.APIDoc.Parser.prototype.parse = function(text) {
    text = text.replace(/\/\*\*([\s\S]*?)\*\//g, function(_, block) {
        return block.replace(/\n(?: \* )?/g, '\n/// ');
        //return block.replace(/\n(?:[^\n]*\* )?/g, '\n/// ');
    });
    this.lines = [];
    this.records = [];
    this.keys = {};
    this.current = null;
    text.split('\n').each(this.processLine.bind(this));
    return this.records;
}

OSDoc.APIDoc.Parser.prototype.processLine = function(line) {
    throw 'wh!'
    var self = this;
    var match;
    if (match = line.match(/^\/\/\/ (.*)/)) {
        this.lines.push(match[1]);
    } else if (this.lines.length || this.options.all) {
        if (this.lines.grep(/@nodoc/).length) {
            ;
        } else if (match = line.match(/^((?:\w+\.)*\w+)\s*=\s*function\s*\((.*?)\)/)) {
            recordDefinition(match[1], match[2] || '');
        } else if (match = line.match(/^((?:\w+\.)*\w+)\s*=\s*(.*?);/)) {
            var master = this.keys[match[2]];
            recordDefinition(match[1], master && master.params);
        } else if ((match = line.match(/^function\s+(\w+)\s*\((.*?)\)/))) {
            recordDefinition(match[1], match[2]);
        } else if ((match = line.match(/^var\s+(\w+)\s+=/))) {
            recordDefinition(match[1]);
        } else {
            processNondefinitionComment(this.lines);
        }
        this.lines = [];
    }
    function recordDefinition(name, params) {
        var record = self.keys[name] = new OSDoc.APIDoc.Definition(name, params);
        record.setDescription(self.lines);
        self.records.push(record);
    }
    function processNondefinitionComment(lines) {
        var match;
        if (lines.length && (match = lines[0].match(/(\^+)\s*(.*)/))) {
            var title = match[2];
            var level = match[1].length;
            var record = new OSDoc.APIDoc.Section(title, level, lines.slice(1));
            self.records.push(record);
        }
    }
}

function Gaps() {
    this.blocks = [];
}

Gaps.prototype = {
    append: function() {
        var blocks = this.blocks;
        for (var i = 0; i < arguments.length; i++) {
            var block = arguments[i];
            if (block instanceof Array)
                this.append.apply(this, block);
            else
                blocks.push(block);
        }
    },

    toString: function() {
        if (this.blocks.length == 1)
            return this.blocks[0];
        var value = this.blocks.join('');
        this.blocks = [value];
        return value;
    }
}

function StandardFormatter() {}

StandardFormatter.prototype = {
    render: function(model) {
        var gaps = this.gaps = new Gaps;
        model.definitions.each(this.definition.bind(this));
        return gaps.toString();
    },

    definition: function(defn) {
        if (defn.onlyModel) {
            defn.definitions.each(this.definition.bind(this));
            return;
        }
        var a = this.gaps;
        this.gaps.append(OSDoc.inlineFormat(defn.docs.join('\n')), '\n');
        if (defn.container.name)
            a.append(defn.getNamespace(), '.', defn.name, ' = function(', defn.parameters.join(', '), ')\n');
        else
            a.append('function ', defn.name, '(', defn.parameters.join(', '), ')\n');
    }
}

function OrderedDict() {
    this.hash = {};
    this.keys = [];
}

OrderedDict.prototype = {
    add: function(key, value) {
        if (!(key in this.hash))
            this.keys.push(key);
        this.hash[key] = value;
    }
}

Function.K = function(x) {return function() {return x}};

function FunctionDefinition(name, params, options) {
    options = options || {};
    this.name = name;
    this.parameters = params.split(/,/).select(pluck('length'));
    this.docs = options.docs||[];
    // FIXME
    this.define = Model.prototype.define;
    this.findOrMake = Model.prototype.findOrMake;
    this.getNamespace = function() {return this.container.getNamespace()};
    this.definitions = [];
}

FunctionDefinition.prototype = {
    toString: function() {
        return ['function ', this.name, '()'].join('');
    }
}

function Model(name) {
    this.name = name;
    this.definitions = [];
    this.docs = [];
    this.onlyModel = true;
    //new OrderedDict;
}

Model.prototype = {
    define: function(defn) {
        var value = this.definitions.detect(function(defn) {
            return defn.name == name;
        });
        if (value) throw "duplicate definition";
        defn.container = this;
        this.definitions.push(defn);
        info('define', defn);
    },

    findOrMake: function(name) {
        info('fm', name);
        var parts = /(.+?)\.(.+)/(name);
        if (parts)
            return this.findOrMake(parts[1]).findOrMake(parts[2]);
        var value = this.definitions.detect(function(defn) {
            return defn.name == name;
        });
        if (!value)
            this.define(value = new Model(name));
        return value;
    },
    
    getNamespace: function() {
        var container = this.container;
        return container && container.name ? container.getNamespace() + '.' + this.name : this.name;
    }
}

// re-implementation.  this replaces what's above
OSDoc.APIDoc.Parser.prototype.parse = function(text) {
    var id = '[a-zA-Z_$][a-zA-Z_$0=9]*';
    var machine = new StateMachineParser({
        tokens: {
            id: id,
        },
        states: {
            initial: [
                    /\/\/\/(.*)/, apidocLine,
                    /\/\*\*/, 'apidocBlock',
                    /\/\*/, 'block-comment',
                    /function (#{id})\s*\((.*?)\).*/, defun,
                    /var\s+(#{id})\s*=/, defvar,
                        /(#{id}(?:\.#{id})*)\.(#{id})\s*=\s*function\s*\((.*?)\).*/, classMethod,
//             'Name...prototype = function', method,
//             'Name...prototype=', member,
//             'Name...=function', classMethod,
//             'Name...=', property
            ],
            apidocBlock: [
                    / ?\* ?(.*?)\*\/\s*/, [apidocLine, 'initial'],
                    / ?\* ?(.*)/, apidocLine,
                    /(.*?)\*\/\s*/, [apidocLine, 'initial'],
                    /(.*)/, apidocLine
            ],
            blockComment: [
                    /\*\//, 'initial'
            ]
        }});
    var model = new Model;
    var blocks = [], lines;
    machine.parse(text);
    return model;
    function apidocLine(s) {
        lines = lines || [];
        lines.push(s.strip());
    }
    function defun(name, args) {
        if (lines) {
            blocks.push(lines.join('\n'));
            lines = null;
        }
        model.define(new FunctionDefinition(name, args, {docs: blocks}));
        blocks = [];
    }
    function classMethod(namespace, name, args) {
        if (lines) {
            blocks.push(lines.join('\n'));
            lines = null;
        }
        var container = model.findOrMake(namespace);
        container.define(new FunctionDefinition(name, args, {docs: blocks}));
        blocks = [];
    }
    function defvar() {}
    function method() {}
    function member() {}
    function property() {}
}

// stateTable :: {String => [Rule]}, where
//   Rule is an alternating list of Regex|String, RHS
//   RHS is a Function (an action) or a String (the name of a state)
function StateMachineParser(options) {
    var tokens = options.tokens;
    var stateTables = options.states;
    this.tables = {};
    for (var key in stateTables) {
        var value = stateTables[key];
        typeof value == 'function' || (this.tables[key] = makeStateTable(value, tokens));
    }
}

StateMachineParser.prototype.parse = function(string) {
    var state = 'initial',
        pos = 0;
    while (pos < string.length) {
        if (string.charAt(pos) == '\n') {
            pos++;
            continue;
        }
        //info('state', state, 'pos', string.slice(pos, pos+40));
        var r = this.tables[state](string, pos);
        state = r.state || state;
        pos = r.pos;
    }
}

function makeStateTable(ruleList, tokens) {
    var debugParser = false;
    var rules = [];
    if (ruleList.length & 1)
        throw "makeStateTable requires an even number of arguments";
    for (var i = 0; i < ruleList.length; ) {
        var pattern = ruleList[i++],
            rhs = ruleList[i++],
            src = pattern;
        if (src instanceof RegExp) {
            src = pattern.toSource();
            src = src.slice(1, src.lastIndexOf('/'));
        }
        src = src.replace(/#{(.+?)}/g, function(s, m) {return tokens[m] || s});
        rules.push({
            source: src,
            re: new RegExp(src, 'g')
        });
        process(rules[rules.length-1], rhs);
    }
    // String -> {state, position}
    return function(string, pos) {
        //info('parsing', '"', string.slice(pos), '"');
        for (var i = 0, re, m; rule = rules[i]; i++) {
            var re = rule.re;
            gr = rule;
            debugParser && info('trying', rule.source, 'at', pos, 'on', string.slice(pos));
            re.lastIndex = pos;
            if ((m = re(string)) && m[0].length) {
                if (!(re.lastIndex-m[0].length == pos )) {
                    //info('!=', re.lastIndex, m[0].length, pos);
                    continue;
                }
                debugParser && info('match', rule);
                rule.action && info(rule.action, m);
                rule.action && rule.action.apply(m[0], m.slice(1));
                return {pos: re.lastIndex, state: rule.target};
            }
            //info('failed', re.toSource(), string.slice(0, 80).toSource(), m);
        }
        throw "no match at " + string.slice(pos,pos+80);
    }
    function process(rule, rhs) {
        switch (typeof rhs) {
        case 'function':
            if (rule.action) throw "duplicate targets";
            rule.action = rhs;
            break;
        case 'string':
            if (rule.target) throw "duplicate targets";
            rule.target = rhs;
            break;
        default:
            rhs && rhs.each(process.bind(this, rule));
        }
    }
}
