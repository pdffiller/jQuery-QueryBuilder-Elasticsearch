/**
 * jQuery QueryBuilder Elasticsearch 'bool' query support
 * https://github.com/mistic100/jQuery-QueryBuilder
 * https://www.elastic.co/
 * https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-bool-query.html
 */

// Register plugin
(function(root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery', 'query-builder'], factory);
    }
    else {
        factory(root.jQuery);
    }
}(this, function($) {
    "use strict";

    var QueryBuilder = $.fn.queryBuilder;
    // DEFAULT CONFIG
    // ===============================
    QueryBuilder.defaults({
        ESBoolOperators: {
            equal:            function(v){ return v; },
            not_equal:        function(v){ return v; },
            less:             function(v){ return {'lt': v}; },
            less_or_equal:    function(v){ return {'lte': v}; },
            greater:          function(v){ return {'gt': v}; },
            greater_or_equal: function(v){ return {'gte': v}; },
            between:          function(v){ return {'gte': v[0], 'lte': v[1]}; },
            not_between:      function(v){ return {'gte': v[0], 'lte': v[1]}; },
            in:               function(v){ return v.split(',').map(function(e) { return e.trim();}); },
            not_in:           function(v){ return v.split(',').map(function(e) { return e.trim();}); },
            begins_with:      function(v){ return v + '*'; },
            not_begins_with:  function(v){ return v + '*'; },
            ends_with:        function(v){ return '*' + v; },
            not_ends_with:    function(v){ return '*' + v; },
            contains:         function(v){ return '*' + v + '*' },
            not_contains:     function(v){ return '*' + v + '*' },
            is_empty:         function(v, rule){ return {'field': rule.field} },
            is_not_empty:     function(v, rule){ return {'field': rule.field} },
            is_null:          function(v, rule){ return {'field': rule.field} },
            is_not_null:      function(v, rule){ return {'field': rule.field} },
        },
        ESQueryStringQueryOperators: {
            is_not_null:      function(){ return "_exists_:"; },
            is_null:          function(){ return "_missing_:";},
            contains:         function(v){ return v; },
            between:          function(v){ return '[' + v[0] + ' TO '+ v[1] + "]"; },
        },
        ESQueryDSLWord: {
            term: [
                "equal",
                "not_equal"
            ],
            terms: [
                "in",
                "not_in"
            ],
            wildcard: [
                "begins_with",
                "not_begins_with",
                "contains",
                "not_contains",
                "ends_with",
                "not_ends_with"
            ],
            range: [
                "less",
                "less_or_equal",
                "greater",
                "greater_or_equal",
                "between",
                "not_between"
            ],
            exists: [
                "is_empty",
                "is_not_empty",
                "is_null",
                "is_not_null"
            ]
        }
    });


    // PUBLIC METHODS
    // ===============================
    QueryBuilder.extend({
        /**
         * Get rules as an elasticsearch bool query
         * @param data {object} (optional) rules
         * @return {object}
         */
        getESBool: function(data) {
            data = (data===undefined) ? this.getRules() : data;

            var that = this;

            return (function parse(data) {
                if (!data.condition) {
                    data.condition = that.settings.default_condition;
                }

                if (['AND', 'OR'].indexOf(data.condition.toUpperCase()) === -1) {
                    error('Unable to build Elasticsearch bool query with condition "{0}"', data.condition);
                }

                if (!data.rules) {
                    return {};
                }

                var parts = {};
                parts.add = function (k, v) {
                    if (this.hasOwnProperty(k)) { this[k].push(v) }
                    else { this[k] = [v] }
                };

                data.rules.forEach(function(rule) {
                    function make_query(rule) {
                        var es_key_val = {};
                        var mdb = that.settings.ESBoolOperators[rule.operator],
                            ope = that.getOperatorByType(rule.operator),
                            part = {};

                        if (mdb === undefined) {
                            error('Unknown elasticsearch operation for operator "{0}"', rule.operator);
                        }

                        if (ope.nb_inputs !== 0) {
                            es_key_val[_getRuleField(rule)] =  mdb.call(that, _getRuleValue(rule), rule);
                            part[getQueryDSLWord.call(that, rule)] = es_key_val;
                        } else {
                            //es_key_val[_getRuleField(rule)] =  mdb.call(that, _getRuleValue(rule), rule);
                            part[getQueryDSLWord.call(that, rule)] = mdb.call(that, _getRuleValue(rule), rule);
                        }

                        if (data.condition === 'OR' && rule.operator === 'not_equal') {
                            return {'bool': {'must_not': [part]}}
                        } else {
                            return part
                        }
                    }
                    var clause = getClauseWord(data.condition, rule.operator);

                    if (rule.rules && rule.rules.length>0) {
                        parts.add(clause, parse(rule));
                    } else {
                        parts.add(clause, make_query(rule));
                    }

                });

                delete parts.add;
                return {'bool': parts}
            }(data));
        },

        /**
         * Get rules as an elasticsearch query string query
         * @param data {object} (optional) rules
         * @return {object}
         */
        getESQueryStringQuery: function(data) {
            data = (data===undefined) ? this.getRules() : data;

            var that = this;

            return (function parse(data) {
                if (!data.condition) {
                    data.condition = that.settings.default_condition;
                }

                if (['AND', 'OR'].indexOf(data.condition.toUpperCase()) === -1) {
                    error('Unable to build Elasticsearch query String query with condition "{0}"', data.condition);
                }

                if (!data.rules) {
                    return "";
                }

                // generate query string
                var parts = "";

                data.rules.forEach(function(rule, index) {
                    function make_query(rule) {
                        var mdb = that.settings.ESQueryStringQueryOperators[rule.operator],
                            ope = that.getOperatorByType(rule.operator),
                            part = "";

                        if (mdb === undefined) {
                            error('Unknown elasticsearch operation for operator "{0}"', rule.operator);
                        }

                        var es_key_val = "";
                        if (ope.nb_inputs !== 0) {
                            es_key_val += _getRuleField(rule) + ":" + mdb.call(that, _getRuleValue(rule));
                            part += es_key_val;
                        }
                        else if (ope.nb_inputs === 0) {
                            es_key_val += mdb.call(that, _getRuleValue(rule)) + _getRuleField(rule);
                            part += es_key_val;
                        }

                        if(data.rules[index+1]) {
                            return part + " " + data.condition + " ";
                        }
                        else {
                            return part;
                        }

                    }
                    if (rule.rules && rule.rules.length>0) {
                        parts += "(" + parse(rule) + ")";
                    } else {
                        parts += make_query(rule);
                    }

                });
                return parts;
            }(data));
        }
    });

    function _getRuleField(rule) {
        if (rule.hasOwnProperty('data') && rule.data.hasOwnProperty('field')) {
            return _getValueOrCall(rule.data, 'field', rule);
        }

        return rule.field;
    }

    function _getRuleValue(rule) {
        if (rule.hasOwnProperty('data') && rule.data.hasOwnProperty('value')) {
            return _getValueOrCall(rule.data, 'value', rule);
        }

        return rule.value;
    }

    function _getValueOrCall(obj, prop, param) {
        if (!obj.hasOwnProperty(prop)) {
            return false;
        }

        if (obj[prop] instanceof Function){
            return obj[prop].call(this, param);
        }

        return obj[prop];
    }

    /**
     * Get the right type of query term in elasticsearch DSL
     */
    var getQueryDSLWord = function (rule) {
        var words = this.settings.ESQueryDSLWord;
        for(var word in words) {
            if (words[word].indexOf(rule.operator) > -1){
                return word;
            }
        }

        return 'wildcard';
    };

    /**
     * Get the right type of clause in the bool query
     */
    function getClauseWord(condition, operator) {
        if (condition == 'OR') {
            return 'should';
        }

        if (["is_not_empty", "is_not_null"].indexOf(operator) > -1) {
            return 'must';
        }

        if (operator != undefined && operator.indexOf('not_') > -1 || ["is_empty", "is_null"].indexOf(operator) > -1) {
            return 'must_not';
        }

        return 'must';
    }
}));
