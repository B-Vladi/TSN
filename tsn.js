/**
 * @author Влад Куркин, Email: b-vladi@cs-console.ru
 * @version 1.0 beta
 * @title Templating System Node.JS
 *
 * Dependents:
 * Стандартный модуль fs, для работы с файловой системой.
 */

var LIB = {
	fileSystem: require('fs')
};

var pathRoot = module.filename.replace(/(.*)\/.*$/, '$1/');

/**
 * Стандартные настройки шаблонизатора.
 * <b>namespace</b> - Постранство имен тегов.
 * <b>templateRoot</b> - Полный путь к папке шаблонов без слеша на конце.
 * <b>encoding</b> - Кодировка файлов шаблона.
 * <b>parseIncluded</b> - Флаг, указывающий на необходимость парсинга шаблонов, вставленных тегом include или template.
 */
var defaultConfig = {
	namespace: 'tsn',
	templateRoot: '',
	encoding: 'utf-8',
	parseIncluded: true,
	saveComments: true
};

var tag;

function getErrorData(result, index, text) {
	text = text.substr(0, index) + result;
	var n = text.lastIndexOf('\n');
	var r = text.lastIndexOf('\r');

	return 'Line: ' + (text.replace(/[^\n\r]+/g, '').length + 1) + ', Char: ' + text.substring((n > r) ? n : r)
		.lastIndexOf(result.replace(/^\s+/, ''));
}

/**
 * Конструктор создания шаблонов.
 * @constructor
 * @param path {String} Относительный путь к файлу шаблона или код шаблона. Полный путь выглядет как config.templateRoot + '/' + path.
 * @param isInline {Boolean} Флаг, указывающий на то что, в параметре @param path передан код шаблона.
 * @trows <i>Invalid path type</i> - Ошибка, возникающая в том случае, если параметр @param path не соответствует типу String.
 * @return {Object} Возвращает объект шаблона.
 */

/*
 todo: Доделать информацию о ошибках парсинга
 * */

var TSN = module.exports = (function() {
	var currentTmplChild,
		currentTemplate,
		regExpTag;

	function toString() {
		var length = this.length,
			vars = this.template['var'],
			value = this.value,
			result = value[--length];

		while (length) {
			result = vars[value[--length]] + result;
			result = value[--length] + result;
		}

		return result;
	}

	function attribute(result, name, value) {
		var match,
			index,
			lastIndex = 0,
			attribute,
			data = [];

		while (match = regExpTag.exec(value)) {
			index = match.index;
			data.push(value.slice(lastIndex, index), match[1]);
			lastIndex = index + match[0].length;
		}

		if (lastIndex) {
			data.push(value.slice(lastIndex));
			attribute = {
				value: data,
				toString: toString,
				length: data.length,
				template: currentTemplate
			};
		} else {
			attribute = value;
		}

		currentTmplChild.attribute[name] = attribute;
	}

	return function(path, isInline) {
		if (!(this instanceof TSN)) {
			return new TSN(path, isInline);
		}

		if (typeof path != 'string') {
			throw new Error('Invalid path type');
		}

		if (typeof TSN.config.namespace != 'string' || !TSN.config.namespace.length || !(/[a-z0-9-_]+/i).test(TSN.config.namespace)) {
			this.namespace = defaultConfig.namespace;
		} else {
			this.namespace = TSN.config.namespace;
		}

		try {
			LIB.fileSystem.realpathSync(TSN.config.templateRoot);
		} catch (error) {
			return error;
		}

		fullPath = TSN.config.templateRoot + '/' + path;
		if (TSN.cache.hasOwnProperty(fullPath)) {
			return TSN.cache[fullPath];
		}

		if (isInline !== true) {
			try {
				path = LIB.fileSystem.readFileSync(fullPath, TSN.config.encoding);
			} catch (error) {
				return error;
			}

			this.path = fullPath;
		}

		this.errors = [];
		this.children = [];
		this.text = '';

		var space = '(?:\\r|\\n[^\\S\\r\\n]*)?',
			tagStart = '(?:&' + this
				.namespace + '.([a-z0-9-_]+);)|(' + space + '<!--[\\s\\S]*?-->)|(?:<!\\[CDATA\\[[\\s\\S]*?\\]\\]>)|(?:' + space + '<\\/\\s*' + this
				.namespace + ':([a-z\\-_]+)\\s*>)',
			regExp = {
				tag: new RegExp(tagStart + '|(?:' + space + '<\\s*' + this
					.namespace + ':([a-z\\-_]+)((?:\\s+[a-z\\-_]+(?::[a-z\\-_]+)?\\s*=\\s*(?:(?:"[^"]*")|(?:\'[^\']*\')))*)\\s*(\\/)?>)', 'gi'),
				attr: /\s*([a-z\-_]+(?::[a-z\-_]+)?)\s*(?:=\s*(?:(?:"([^"]*)")|(?:'[^']*')))?/gi,
				xml: /^\s*<\?xml(?:\s+[a-z\-_]+(?::[a-z\-_]+)?\s*=\s*"[^"]*")*\s*\?>\s*/i,
				entity: new RegExp('&' + this.namespace + '.([a-z0-9]+);', 'gi')
			},
			match,
			current = this,
			node,
			stack = [],
			resultLength = 0,
			xmlDeclaration = '',
			result,
			currentResultLength,
			comment,
			value,
			closeTagName,
			openTagName,
			attributes,
			emptyTag,
			index,
			lastIndex = 0,
			fullPath,
			tagData;

		currentTemplate = TSN.cache[fullPath] = this;
		regExpTag = regExp.entity;

		path = path.replace(regExp.xml, function (result) {
			xmlDeclaration = result;
			return '';
		});

		while (match = regExp.tag.exec(path)) {
			result = match[0];
			currentResultLength = result.length;
			value = match[1];
			comment = match[2];
			closeTagName = match[3];
			openTagName = match[4];
			attributes = match[5];
			emptyTag = match[6];
			index = match.index;

			this.text += path.substring(lastIndex, index);

			if (value) {
				node = {
					name: 'echo',
					attribute: {
						'var': value
					},
					start: index - resultLength,
					end: index - resultLength,
					index: current.children.length,
					parent: current
				};

				current.children.push(node);

				resultLength += currentResultLength;
			} else if (openTagName) {
				if (tag.hasOwnProperty(openTagName)) {
					node = {
						name: openTagName,
						attribute: {},
						start: index - resultLength,
						index: current.children.length,
						parent: current
					};

					current.children.push(node);

					if (emptyTag) {
						node.end = node.start;
					} else {
						node.children = [];
						stack.push(current);
						current = node;
					}

					if (attributes) {
						currentTmplChild = node;
						attributes.replace(regExp.attr, attribute);
					}

					if (tag[openTagName].hasOwnProperty('parse') && typeof tag[openTagName].parse == 'function') {
						tag[openTagName].parse.call(this, node);
					}
				} else {
					this.errors
						.push((emptyTag ? 'Unknown tag \'' : 'Unknown tag opening\'') + openTagName + '\'\n' + getErrorData(xmlDeclaration + result, index, path));
				}

				resultLength += currentResultLength;
			} else if (closeTagName) {
				if (tag.hasOwnProperty(closeTagName)) {
					if (current.name == closeTagName) {
						if (!current.children.length) {
							delete current.children;
						}

						current.end = index - resultLength;
						current = stack.pop();
					} else {
						this.errors
							.push('Missing start tag \'' + closeTagName + '\'\n' + getErrorData(xmlDeclaration + result, index, path));
					}
				} else {
					this.errors
						.push('Unknown tag closing \'' + closeTagName + '\'\n' + getErrorData(xmlDeclaration + result, index, path));
				}

				resultLength += currentResultLength;
			} else if (comment) {
				if (TSN.config.saveComments === true) {
					this.text += result;
				} else {
					resultLength += currentResultLength;
				}
			} else {
				this.text += result;
			}

			lastIndex = index + currentResultLength;
		}

		while (tagData = stack.pop()) {
			tagData.end = tagData.start;
			this.errors.push('Tag is not closed \'' + tagData.name + '\'\n' + getErrorData(xmlDeclaration + result, tagData
				.start, path));
		}

		currentTemplate = currentTmplChild = regExpTag = null;

		this.text += path.substring(lastIndex);
	};
})();

/**
 * Кеш. Содержит все созданные объекты шаблона, загруженные из файла.
 * Именами свойств являются полные пути к соответствующим шаблонам.
 */
TSN.cache = {};

/**
 * Метод расширения набора тегов шаблонизатора.
 * @param name {String} Локальное имя тега.
 * @param data {Object} Объектное описание тега.
 */
TSN.extend = function(name, data) {
	if (typeof name == 'string' && data && (typeof data['in'] == 'function' || typeof data['out'] == 'function')) {
		tag[name] = data;
	}
};

/**
 * Рендеринг шаблона на основе переданных данных.
 * @param data {Object} Объект данных, на основе которых генерируется результат.
 * @this {Object} Объект шаблона.
 * @return {Text} Результат рендеринга.
 */
TSN.prototype.render = function(data) {
	var currentNode = this,
		currentChild = currentNode.children ? currentNode.children[0] : false,
		result = '',
		isParse,
		lastIndex = 0,
		isInline,
		templateText = this.text,
		tagData,
		tagName,
		newResult,
		listener,
		parent,
		contexts = [];

	this.data = this.context = data;

	for (tagName in tag) {
		if (tag.hasOwnProperty(tagName) && typeof tag[tagName].startRender == 'function') {
			tag[tagName].startRender.call(this);
		}
	}

	currentNode.text = '';

	while (true) {
		if (currentChild) {
			isInline = currentChild.isIncluded !== true;

			if (isInline) {
				currentNode.text += templateText.slice(lastIndex, currentChild.start);
			}

			lastIndex = currentChild.start;

			isParse = true;
			listener = tag[currentChild.name]['in'];

			switch (typeof listener) {
				case 'boolean':
					isParse = listener;
					break;
				case 'function':
					isParse = listener.call(this, currentChild);
					break;
			}

			contexts.push(this.context);
			this.context = currentChild.context || this.context;
			delete currentChild.context;

			if (isParse === false) {
				tagData = tag[currentChild.name]['out'];
				if (typeof tagData == 'function') {
					tagData.call(this, currentChild);
				}

				this.context = contexts.pop();
				currentNode.text += currentChild.text || '';
				delete currentChild.isIncluded;
				delete currentChild.text;

				lastIndex = currentChild.end;
				currentChild = currentNode.children[currentChild.index + 1];
			} else {
				if (currentChild.hasOwnProperty('children')) {
					currentChild.text = '';
					currentNode = currentChild;
					currentChild = currentNode.children[0];
				} else {
					currentChild.text = templateText.slice(lastIndex, currentChild.end);

					lastIndex = isInline ? currentChild.end : currentNode.end;

					tagData = tag[currentChild.name]['out'];
					if (typeof tagData == 'function') {
						tagData.call(this, currentChild);
					}

					this.context = contexts.pop();

					currentNode.text += currentChild.text;
					delete currentChild.isIncluded;
					delete currentChild.text;

					currentChild = currentNode.children[currentChild.index + 1];
				}
			}
		} else {
			if (currentNode == this) {
				result = currentNode.text + templateText.slice(lastIndex);
				this.text = templateText;
				break;
			}

			currentNode.text += templateText.slice(lastIndex, currentNode.end);

			parent = currentNode.parent;
			lastIndex = currentNode.isIncluded === true ? parent.end : currentNode.end;

			tagData = tag[currentNode.name]['out'];
			if (typeof tagData == 'function') {
				tagData.call(this, currentNode);
			}

			this.context = contexts.pop();

			parent.text += currentNode.text;
			delete currentNode.isIncluded;
			delete currentNode.text;

			currentChild = parent.children[currentNode.index + 1];
			currentNode = parent;
		}
	}

	delete this.data;
	delete this.context;

	for (tagName in tag) {
		if (tag.hasOwnProperty(tagName) && typeof tag[tagName].endRender == 'function') {
			newResult = tag[tagName].endRender.call(this, result);
			if (typeof newResult == 'string') {
				result = newResult;
			}
		}
	}

	return result;
};

/**
 * Повторный парсинг шаблона, загруженного из файла.
 * @param newPath {String} Необязательный параметр, сответствующий новому относительному пути к файлу шаблона.
 * @this {Object}
 * @return {Object} Объект шаблона или ошибку доступа к файлу.
 */
TSN.prototype.reload = function(newPath) {
	var path = TSN.config.templateRoot + '/' + (typeof newPath == 'string' ? newPath : this.path);

	try {
		path = LIB.fileSystem.realpathSync(path);
	} catch (e) {
		return e;
	}

	if (TSN.cache.hasOwnProperty(path)) {
		delete TSN.cache[path];
	}

	return TSN.call(this, newPath, false);
};

LIB.fileSystem.readFile(pathRoot + 'config.json', 'utf-8', function(err, data) {
	if (err) {
		TSN.config = defaultConfig;
	} else {
		try {
			var config = JSON.parse(data);
		} catch(e) {
			throw new Error('Format error in configuration file \'' + pathRoot + 'config.json\'');
		}

		for (var property in defaultConfig) {
			if (defaultConfig.hasOwnProperty(property) && !config.hasOwnProperty(property)) {
				config[property] = defaultConfig[property];
			}
		}

		TSN.config = config;
	}
});

tag = require(pathRoot + 'tags.js');