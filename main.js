function throw_error(text) {
    console.trace();
    throw text;
}

let TABS = {};
function init_tabs() {
    function activate_tab(tab, index) {
        Object.keys(TABS[index].blocks).map((block)=>{
            TABS[index].blocks[block].classList.remove("is-visible");
        });
        TABS[index].blocks[tab].classList.add("is-visible");

        Object.keys(TABS[index].tabs).map((tab)=>{
            TABS[index].tabs[tab].classList.remove("is-active");
        });
        TABS[index].tabs[tab].classList.add("is-active");
        TABS[index]['activated'] = tab;
    };

    let saved_state = loadState();
    let base = window.location.pathname;

    TABS = {};
    Array.from(document.getElementsByClassName("tabs")).map((div, ix)=>{
        var blocks = (
            Array.from(div.parentElement.getElementsByClassName("block"))
            .reduce((a, v)=>{
                a[v.dataset["block"]]=v;
                return a
            }, {})
        );
        var tabs = (
            Array.from(div.getElementsByTagName("li"))
            .reduce((a, v)=>{
                a[v.dataset["block"]]=v;
                if (((ix==0)&&(v.dataset["block"]=='mortgage'))||((ix==1)&&(v.dataset["block"]=='stats'))) {
                } else {
                    v.getElementsByTagName("a")[0].href = `${base}?t_${ix}=${v.dataset["block"]}`;
                    v.getElementsByTagName("a")[0].onclick=()=>{return false;};
                }
                return a;
            }, {})
        );
        TABS[ix] = {blocks, tabs};

        Object.keys(tabs).map((name)=>{
            tabs[name].addEventListener("click", ((theblock, index)=>{
                return (e)=>{
                    activate_tab(theblock, index);
                    saveState();
                };
            })(
                name, ix
            ));

            if (tabs[name].classList.contains("is-active")) {
                activate_tab(name, ix);
            }
        });

        if (`t_${ix}` in saved_state) {
            activate_tab(saved_state[`t_${ix}`], ix);
        };
    });
}

function get_parameters(formula) {
    let params = [];
    if (formula===undefined) return params;

    const rg_fn=/([a-zA-Z_\.]+)\(([^\)]*)\)(\.[a-zA-Z_]+)*/g; // function().field call
    for (const match of formula.matchAll(rg_fn)) {
        const sub = match[0];
        get_parameters(match[2]).map((p)=>{
            params.push(p);
        });
        formula = formula.replaceAll(sub," ");
    };

    const rg_fld=/([a-zA-Z_][a-zA-Z0-9_]*)(\.[a-zA-Z_][a-zA-Z0-9_]*)+/g; // structure.field
    for (const match of formula.matchAll(rg_fld)) {
        const sub = match[0];
        if (match[1]!="Math") {
            params.push(match[1]);
            formula = formula.replaceAll(sub," ");
        }
    };

    formula
    .split(/[:> \?\d\*\.\+\-\/,\(\)\[\]']/g)
    .reduce((a, v)=>{if (v) a.push(v); return a}, [])
    .map((p)=>{
        params.push(p);
    });

    return Array.from(new Set(params));
}

let FIELDS = {};
function saveState() {
    let str_state = "";

    Object.keys(TABS).map((index)=>{
        if (TABS[index]['activated']!=['mortgage', 'stats'][index]) {
            str_state += (str_state=="") ? "?" : "&";
            str_state += `t_${index}=${TABS[index]['activated']}`;
        };
    });

    Object.keys(FIELDS).map((id)=>{
        let fdesc = FIELDS[id];
        if (fdesc.input!==undefined) {
            if ( (!fdesc.input.disabled) && (fdesc.input.value != fdesc.field.dataset['default']) ) {
                str_state += (str_state=="") ? "?" : "&";
                str_state += `${id}=${fdesc.input.value}`;
            };
        }
    });    

    const url = window.location.pathname.split('/').pop() + str_state;
    window.history.pushState({page: url}, "", url);
}

function loadState() {
    let values = {};
    if (window.location.search!="") {
        window.location.search.split("?")[1].split("&").map((kv)=>{
            let kkv = kv.split("=");
            if (kkv[1]!="")
                values[kkv[0]] = kkv[1];
        })
    }
    return values;
}

function init_fields() {
    FIELDS = {};

    let saved_state = loadState();

    Array.from(document.getElementsByClassName("field")).map((field)=>{
        const input = field.getElementsByTagName("input")[0];
        const id = field.id||input.id;

        if (id === undefined) 
            throw_error(`undefined id for field: ${field}`)

        if (id in FIELDS) 
            throw_error(`duplicate field id ${id}`)

        if (input!==undefined) {
            if (field.dataset["formula"]!==undefined) {
                input.disabled = true;
            } else {
                if (saved_state[id]!==undefined) {
                    input.value = saved_state[id];
                } else if (field.dataset['default']!==undefined) {
                    input.value = field.dataset['default'];
                };

                if (field.dataset["type"]!='raw') {
                    input.addEventListener("wheel", (e)=>{
                        let tune = e.target.parentNode.parentNode.dataset['tune'];
                        if ((tune)&&(e.shiftKey)) {
                            let id = e.target.parentNode.parentNode.id || e.target.id;
                            let value = get_field_value(id, "");
                            if (e.deltaY>0) {
                                e.target.value = value - 1.0*tune;
                            } else {
                                e.target.value = value + 1.0*tune;
                            };
                            e.preventDefault();
                            saveState();
                            recalculate_fields();
                            return true;
                        };
                    });
                    input.addEventListener("change", ()=>{
                        saveState();
                        recalculate_fields();
                    });
                } else {
                    input.addEventListener("change", ()=>{
                        saveState();
                    });
                };
            }
            field.title = input.disabled ? `${id} = ${field.dataset["formula"]}` : id;
        };

        FIELDS[id] = {
            "id" : id,
            "field" : field,
            "input" : input,
            "formula" : field.dataset["formula"],
            "type" : field.dataset["type"],
            "round" : field.dataset["round"]||2,
            "params" : get_parameters(field.dataset["formula"])
        }
    });
}

function evalInScope(js, contextAsScope) {
    return function() { 
        with(this) { return eval(js); }; 
    }
    .call(contextAsScope);
}

function eval_if_needed(expression, context, mapper) {
    context = (context===undefined) ? {} : context;
    mapper = (mapper===undefined) ? ((v)=>{return v}) : mapper;
    if (/[\+-\/\*\(\)]/g.test(expression)) {
        if (typeof(context)=="function") context = context();
        return evalInScope(expression, context);
    } else {
        return mapper(expression);
    }
}

function gather_param_values(params, path) {
    let calculation_context = {};

    let error = undefined;
    for(let i=0; i < params.length; i++) {
        const param_name = params[i];

        if (path.includes(`[${param_name}]`))
            throw_error(`cyclic dependency:  ${path}->${param_name}`)

        calculation_context[params[i]] = get_field_value(param_name, `${path}->[${param_name}]`);
        if (calculation_context[params[i]]===undefined) {
            error = `Error: specify ${param_name}`;
            break;
        }
    };

    return {
        calculation_context,
        error
    }
}

function get_field_value(id, path) {
    const fdesc = FIELDS[id];
    if (fdesc===undefined) throw_error(`undefined parameter ${id} requested from path ${path}`);

    let value = (fdesc.input===undefined) ? fdesc.value : fdesc.value||fdesc.input.value;

    if (fdesc.input!==undefined) { // user input field
        if (!fdesc.input.disabled) { // mannual input field
            if (fdesc.type=='raw') {
                return value;
            } else if (value=="") {
                console.log(`field ${id} value must be specified`);
                return undefined;
            };
            return 1.0*eval_if_needed(value);
        }
    };
    
    // calculatable field
    if ((value!==undefined)&&(value!=""))
        return value;

    let {calculation_context, error} = gather_param_values(fdesc.params, path);

    if (error) {
        fdesc.input.value = error;
        throw_error(error);
    } else {
        try {
            value = evalInScope(fdesc.formula, calculation_context);
            if (fdesc.input===undefined) {
                fdesc.value = value;
            } else {
                const xp = 10**fdesc.round;
                fdesc.input.value = Math.round(xp * value)/xp;
                fdesc.value = value;
            };
        } catch (ex) {
            if (fdesc.input!==undefined)
                fdesc.input.value = `Error in formula: ${ex.message}`;
            throw_error(ex);
        }
    }

    // console.log(id, value);
    return value;
}

let recalc_tag = ["Recalculate"];
let tick_state = [0,0];
function recalculate_fields(direct, keep_overrides) {
    Array.from(document.getElementsByClassName("recalc_button")).map((b)=>{
        b.innerHTML = "..calculation error: check console..";
    });

    if (!keep_overrides) {
        OVERRIDES = {};
    };
    
    // cleanup
    Object.keys(FIELDS).map((id)=>{
        let fdesc = FIELDS[id];
        if (fdesc.input===undefined) {
            // direct invisible field
            fdesc.value = undefined;
        } else {
            if (fdesc.input.disabled) {
                // formula field
                fdesc.input.value = "";
                fdesc.value = undefined;
            }
        };
    });

    // recalc
    Object.keys(FIELDS).map((id)=>{
        let fdesc = FIELDS[id];
        if (fdesc.input!==undefined) {
            if (fdesc.input.disabled) 
                get_field_value(id, "");
            };
    });

    let section = document.querySelectorAll("div[data-block='whatif']")[0];
    if (section.classList.contains("is-visible") && (!direct)) {
        graph_whatif();
    };

    section = document.querySelectorAll("div[data-block='entry']")[0];
    if (section.classList.contains("is-visible") && (!direct)) {
        graph_entry();
    };

    if (!direct) {
        Array.from(document.getElementsByClassName("recalc_button")).map((b)=>{
            b.innerHTML = recalc_tag[0];
        });        
    };
    
    if (!direct) {
        let lt = ['A', 'L', 'I'][get_field_value("loan_type")*1-1];
        document.title = `${lt}:${get_field_value("house_price")}:${get_field_value("savings")}`;
        document.title += ` ${get_field_value("loan_term")}/${get_field_value("loan_term_actual")}`;
        document.title += ` ${Math.round(100 * get_field_value("housing_roi")) / 100}`;
    } else {
        document.title = "⏳";
        tick_state[0]+=1;
        if (tick_state[0]>10) {
            tick_state[0]=0;
            tick_state[1]+=1;
        }
        document.title += ['/','-','\\','|'][tick_state[1]%4];
    };
}

OVERRIDES = {};
function loan_schedule(loan_result) {
    function extra_payment_adjuster(event) {
        let old_value = event.target.innerHTML;
        let new_value = prompt("Enter adjusted extra payment value", old_value);
        if ((new_value!=old_value)&&(new_value!==undefined)&&(new_value!="")&&(new_value!=null)) {
            OVERRIDES[event.target.id] = new_value*1;
            recalculate_fields(false, true);
        };
    };

    let schedule_dom = document.querySelectorAll("div[data-block='schedule']")[0];
    schedule_dom = schedule_dom.getElementsByClassName("column")[0];
    schedule_dom.innerHTML="";

    let table = document.createElement("table");

    let thead = document.createElement("thead");
    let tr = document.createElement("tr");
    Object.keys(loan_result.monthly[0]).map((key)=>{
        let th = document.createElement("th");
        th.textContent=key;
        tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);

    let tbody = document.createElement("tbody");

    let month = 0;
    let annual = {};
    let debt = 0;
    loan_result.monthly.map((record)=>{
        month+=1;
        if (month==1) debt = record["debt"];

        if ((month%12==1)&&(month>1)) {
            tr = document.createElement("tr");
            Object.keys(record).map((key)=>{
                let td = document.createElement("td");
                let content = Math.round(100*annual[key])/100;
                if (key=="debt") {
                    content = Math.round(1000*record[key] / debt) / 10 + "%";
                } else if (key=="month") {
                    content = ("year_" + (month-1)/12);
                };
                td.innerHTML = `<b style="color:#00F">${content}</b>`;
                tr.appendChild(td);
                annual[key] = 0;
            });
            tbody.appendChild(tr);
        };

        tr = document.createElement("tr");
        Object.keys(record).map((key)=>{
            let td = document.createElement("td");
            if (key=="debt") {
                annual[key] = (annual[key]||record[key]);
            } else {
                annual[key] = (annual[key]||0) + record[key];
            };

            td.innerHTML = Math.round(100*record[key])/100;
            if (key=="extra_payment") {
                td.id = "xp_" + record["month"];
                td.addEventListener("click", extra_payment_adjuster);
                if ("xp_" + record["month"] in OVERRIDES) {
                    td.classList.add("overrided");
                };
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    schedule_dom.appendChild(table);
    // console.log(loan_result);
}

function graph_payments(loan_result) {
    let months = loan_result.monthly.map((record)=>{
        return Math.round(100*record["month"])/100
    });

    let data =  Object
    .keys(loan_result.monthly[0])
    .filter((v)=>{return v!='month'})    
    .map((key)=>{
        return {
            x : months,
            y : loan_result.monthly.map((record)=>{
                return record[key];
            }),
            type: 'scatter',
            name: key,
            visible: key=="debt" ? 'legendonly' : undefined
        }
    });

    let layout = {
        title:'Mortgage graph',
        xaxis: {
            title: 'month'
        },
        yaxis: {
            title: '€'
        }
    };

    Plotly.newPlot("graph_payments_target", data, layout);
}

function graph_assets(assets_result) {
    let result_renting = assets_result.renting;
    let result_housing = assets_result.housing;
    let result_metrics = assets_result.metrics;

    let months = result_renting.monthly.map((record)=>{
        return Math.round(100*record["month"])/100
    });

    let data =  Object
    .keys(result_metrics.monthly[0])
    .filter((v)=>{return (v!='month')&&(!v.startsWith("_"))})
    .map((key)=>{
        return {
            x : months,
            y : result_metrics.monthly.map((record)=>{
                return record[key]
            }),
            type: 'scatter',
            name: key+"",
            visible: key=="debt" ? 'legendonly' : undefined
        }
    });

    Object
    .keys(result_renting.monthly[0])
    .filter((v)=>{return v!='month'})    
    .map((key)=>{
        data.push({
            x : months,
            y : result_housing.monthly.map((record)=>{
                return record[key]
            }),
            type: 'scatter',
            name: key+"_renting",
            visible: key=="debt" ? 'legendonly' : undefined
        })
    });

    Object
    .keys(result_housing.monthly[0])
    .filter((v)=>{return v!='month'})    
    .map((key)=>{
        data.push({
            x : months,
            y : result_housing.monthly.map((record)=>{
                return record[key]
            }),
            type: 'scatter',
            name: key+"_housing",
            visible: key=="debt" ? 'legendonly' : undefined
        })
    });

    let layout = {
        title:'Assets dynamics',
        xaxis: {
            title: 'month'
        },
        yaxis: {
            title: '€'
        }
    };

    Plotly.newPlot("graph_assets_target", data, layout);
}

function graph_whatif() {
    function parse_variable(name) {
        let var_def = get_field_value(name).split("(");
        if (var_def[0].trim()=="") 
            return [];
        let range = var_def[1].replaceAll(")", "").split(',').map((value)=>{
            return 1.0*eval_if_needed(value);
        });
        var_def = var_def[0];
        let old_value = FIELDS[var_def].input.value;
        return [var_def, range, old_value];
    }

    function add(target, source) {
        Array.from(Object.keys(source)).map((key)=>{
            target[key] = source[key]; 
        });        
    }

    let all_parameters = Array.from(Object.keys(FIELDS));
    let original_parameters = {};
    
    let tmp = gather_param_values(all_parameters, "").calculation_context;
    Array.from(Object.keys(tmp)).map((key)=>{
        original_parameters[key + "_0"] = copy(tmp[key]);
    });

    function get_metric_value(metric) {
        return eval_if_needed(metric, ()=>{
            let {calculation_context, error} = gather_param_values(all_parameters, "");
            if (error) console.error("Error while calculating context:", error);
            add(calculation_context, original_parameters);
            return calculation_context;
        }, (metric)=>{
            return get_field_value(metric)
        });
    }

    let [variable1, range1, old_value1] = parse_variable("variable1");
    let [variable2, range2, old_value2] = parse_variable("variable2");

    let results = [];
    for(let value1 = range1[0]*1; value1 <= range1[1]*1; value1 += (range1[1]*1 - range1[0]*1) / (range1[2]*1 - 1)) {
        FIELDS[variable1].input.value = value1;

        if (variable2==undefined) { // 2d plot, many metrics
            let result = {};
            result[variable1] = value1;
            recalculate_fields(true);
            get_field_value("metrics").split(",").map((metric)=>{
                const metric0 = metric.trim();
                result[metric0] = get_metric_value(metric0);
            });
            results.push(result);

        } else { // 3d surface plot - two parameters, one metric
            let result = [];
            for(let value2 = range2[0]*1; value2 <= range2[1]*1; value2+=(range2[1]*1 - range2[0]*1) / (range2[2]*1 - 1)) {
                FIELDS[variable2].input.value = value2;
                let xyz = {};
                xyz[variable1] = value1;
                xyz[variable2] = value2;
                recalculate_fields(true);

                const metric0 = get_field_value("metrics").split(",")[0].trim(); // take first metric
                xyz[metric0] = get_metric_value(metric0);
                result.push(xyz);
            };
            results.push(result);
        }
    };

    // restore original parameters
    FIELDS[variable1].input.value = old_value1;
    if (variable2!==undefined) 
        FIELDS[variable2].input.value = old_value2;
    recalculate_fields(true);

    let data = null;
    let layout = null;

    if (variable2==undefined) {
        let xs = results.map((record)=>{
            return record[variable1];
        });
    
        data =  Object
        .keys(results[0])
        .filter((v)=>{return v!=variable1})
        .map((key)=>{
            return {
                x : xs,
                y : results.map((record)=>{
                    return record[key]
                }),
                type: 'scatter',
                mode: 'lines+markers',
                name: key,
                //visible: key=="debt" ? 'legendonly' : undefined
            }
        });
    
        layout = {
            title:'What-if modelling : ' + variable1,
            xaxis: {
                title: results
            },
            yaxis: {
                title: 'metrics'
            }
        };

    } else {
        const key = get_field_value("metrics").split(",")[0].trim();
        data = [{
            z: results.map((a)=>{return a.map((r)=>{return r[key]})}),
            x: results[0].map((r)=>{return r[variable2]}),
            y: results.map((a)=>{return a[0][variable1]}),
            type: 'surface',
            contours: {
              z: {
                show:true,
                usecolormap: true,
                highlightcolor:"#42f462",
                project:{z: true}
              }
            }
        }];
        layout = {
            title: {
                text: 'What-if modelling: ' + key + ", x=" + variable2 + ', y=' + variable1 + "",
            },
            scene: {camera: {eye: {x: 1.87, y: 0.88, z: 0.84}}},
            width: 700,
            height: 700,
            xaxis: {
                title: {
                    text: variable1,
                },
            },
            yaxis: {
                title: {
                    text: variable2,
                }
            }            
        };
    };

    let div_whatif = document.getElementById("graph_whatif_target");
    div_whatif.innerHTML = "";
    Plotly.newPlot("graph_whatif_target", data, layout);
}

function graph_entry() {
    function add(target, source) {
        Array.from(Object.keys(source)).map((key)=>{
            target[key] = source[key]; 
        });        
    }

    let all_parameters = Array.from(Object.keys(FIELDS));
    let original_parameters = {};
    let tmp = gather_param_values(all_parameters, "").calculation_context;
    Array.from(Object.keys(tmp)).map((key)=>{
        original_parameters[key + "_0"] = copy(tmp[key]);
        original_parameters[key] = copy(tmp[key]);
    });

    function get_metric_value(metric) {
        return eval_if_needed(metric, ()=>{
            let {calculation_context, error} = gather_param_values(all_parameters, "");
            if (error) console.error("Error while calculating context:", error);
            add(calculation_context, original_parameters);
            return calculation_context;
        }, (metric)=>{
            return get_field_value(metric)
        });
    }

    let house_rate = original_parameters.house_market_rate / (100 * 12);
    let downpayment_pct = original_parameters.assets_to_downpayment / 100;
    let new_params = {};
    let probe_month = get_metric_value("entry_probe_month");

    let results = [];
    for(let delay = 0; delay < original_parameters.loan_term; delay += 1) {
        let result = {};
        result["delay"] = delay+1;

        new_params.house_price = original_parameters.house_price * Math.pow(1.0+house_rate, delay+1);
        new_params.savings = original_parameters.assets_result.renting.monthly[delay].total_assets * downpayment_pct;

        [new_params.current_cash_assets, new_params.current_stocks_assets] = original_parameters.assets_result.metrics.monthly[delay]._assets;
        if (new_params.current_cash_assets >= new_params.house_price) {
            results.push(result);
            break;
        };

        new_params.bonus_month = (original_parameters.bonus_month) - (delay + 1);
        while (new_params.bonus_month<=0) new_params.bonus_month += 12;

        new_params.extra_payment_start = (original_parameters.extra_payment_start) - (delay + 1);
        if (original_parameters.extra_payment_period>0)
            while (new_params.extra_payment_start<=0) new_params.extra_payment_start += original_parameters.extra_payment_period;

        Array.from(Object.keys(new_params)).map((key)=>{
            FIELDS[key].input.value = new_params[key];
        });
        recalculate_fields(true);

        let state = gather_param_values(all_parameters, "").calculation_context;
        if (state.loan <= new_params.savings * 0.05) {
            results.push(result);
            break;
        };

        // entry parameters
        result["entry_total_assets"] = original_parameters.assets_result.renting.monthly[delay].total_assets;
        result["entry_savings"] = new_params.savings;
        result["entry_house_price"] = new_params.house_price;

        // loan exit parameters
        [
            "loan", "loan_term_actual", "total_paid_net_monthly",
            "payment_first", "payment_base_first", 
            "extra_payment_roi", "months_to_even"
        ].map((metric)=>{
            result["loan_" + metric] = (state[metric]<0)?null:state[metric];
        });

        // loan internal parameters, housing
        [
            "total_assets"
        ].map((metric)=>{
            let r = state.assets_result.housing.monthly[probe_month - delay - 2];
            if (r!==undefined)
                result["housing_" + metric + "@" + probe_month] = r[metric];
        });

        // loan internal parameters, metrics
        [
            "housing_roi", "assets_k", "assets_delta" 
        ].map((metric)=>{
            let r = state.assets_result.metrics.monthly[probe_month - delay - 2];
            if (r!==undefined)
                result[metric + "@" + probe_month] = r[metric];
        });

        results.push(result);
    };

    // restore original parameters
    Array.from(Object.keys(new_params)).map((key)=>{
        FIELDS[key].input.value = original_parameters[key];
    });    
    recalculate_fields(true);

    let data = null;
    let layout = null;

    let xs = results.map((record)=>{
        return record["delay"];
    });

    data =  Object
    .keys(results[0])
    .filter((v)=>{return v!="delay"})
    .map((key)=>{
        return {
            x : xs,
            y : results.map((record)=>{
                return record[key]
            }),
            type: 'scatter',
            mode: 'lines+markers',
            name: key,
            //visible: key=="debt" ? 'legendonly' : undefined
        }
    });

    layout = {
        title:'Entrypoint ananlysis',
        xaxis: {
            title: results
        },
        yaxis: {
            title: 'metrics'
        }
    };


    let div_entry = document.getElementById("graph_entry_target");
    div_entry.innerHTML = "";
    Plotly.newPlot("graph_entry_target", data, layout);
}


function loan_stats(loan_result) {
    let result = loan_result;
    let last = result.monthly.length - 1;
    return {
        "payment_first" : result.monthly[0].total_payment - result.monthly[0].extra_payment2,
        "payment_base_first" : result.monthly[0].base_payment,
        "payment_last" : result.monthly[last].total_payment- result.monthly[last].extra_payment2,
        "payment_base_last" : result.monthly[last].base_payment,
        "total_paid_gross" : result.total_paid_gross,
        "total_paid_net" : result.total_paid_gross - result.total_tax_returned,
        "total_tax_returned" : result.total_tax_returned,
        "total_paid_extra" : result.total_paid_extra,
        "total_paid_penalty" : result.total_penalty,
        "actual_term" : result.monthly.length,
    }
}

function sum(a) {
    return a.reduce((a,s)=>{return a+s}, 0);
}

function calc_assets({current_cash_assets, current_stocks_assets, deposit_rate, stocks_rate, monthly_savings, loan_result, loan_term, savings, bonus_month, bonus_cash, bonus_stocks, rent, monthly_ownership_tax, loan, house_value, house_market_rate}) {
    let deposit_rate_m = deposit_rate/(100*12);
    let stocks_rate_m = stocks_rate/(100*12);
    let loan_term_actual = loan_result.monthly.length;

    let increment_renting = 0;
    let increment_housing = 0;

    let monthly_renting = [];
    let monthly_housing = [];
    let monthly_metrics = [];

    let assets_renting = [current_cash_assets, current_stocks_assets];
    let stocks_taken = (current_cash_assets >= savings) ? 0 : (savings - current_cash_assets);
    let assets_housing = [
        current_cash_assets - (savings - stocks_taken),
        current_stocks_assets - stocks_taken
    ];

    let house_rate = house_market_rate / (100*12);
    let estate_owned = house_value - loan;

    let total_paid_interest = 0;
    let total_tax_returned = 0;
    let assets_delta = 0;

    let months_to_even = loan_term;

    for(let i=0; i<loan_term; i++) {
        let payment = (i < loan_term_actual) ? loan_result.monthly[i] : {total_payment:0, tax_return:0, capital_payment:0, interest_amt:0};
        total_tax_returned += payment.tax_return;
        total_paid_interest += payment.interest_amt;

        assets_renting[0] += assets_renting[0] * deposit_rate_m;
        assets_renting[1] += assets_renting[1] * stocks_rate_m;
        assets_housing[0] += assets_housing[0] * deposit_rate_m;
        assets_housing[1] += assets_housing[1] * stocks_rate_m;

        m_bonus_cash = (((i%12)+1)==bonus_month) ? bonus_cash : 0;
        m_bonus_stocks = (((i%12)+1)==bonus_month) ? bonus_stocks : 0;

        increment_renting = monthly_savings;
        assets_renting[0] += increment_renting + m_bonus_cash;
        assets_renting[1] += m_bonus_stocks;
        increment_renting += m_bonus_cash + m_bonus_stocks;
        if (increment_renting < 0) console.warn(`monthly increment_renting is negative, month:${i+1}, increment ${increment_renting}`);
        if (sum(assets_renting) < 0) console.warn(`Renting: Asset balance is negative, month:${i+1}`);
        monthly_renting.push({
            month : i+1,
            increment: increment_renting,
            total_assets: sum(assets_renting),
        });

        increment_housing = monthly_savings + rent - monthly_ownership_tax + payment.tax_return - payment.total_payment;
        assets_housing[0] += increment_housing + m_bonus_cash;
        assets_housing[1] += m_bonus_stocks;
        increment_housing += m_bonus_cash + m_bonus_stocks;
        if (increment_housing < 0) console.warn(`monthly increment_housing is negative, month:${i+1}, increment ${increment_housing}`);
        if (sum(assets_housing) < 0) console.warn(`Housing: Asset balance is negative, month:${i+1}`);
        estate_owned += payment.capital_payment;
        estate_owned_rated = estate_owned * Math.pow(1.0+house_rate, i+1);

        monthly_housing.push({
            month : i+1,
            increment: increment_housing,
            total_assets : sum(assets_housing) + estate_owned_rated,

            liquid_assets : sum(assets_housing),
            estate_owned : estate_owned_rated,
        });

        assets_delta = (sum(assets_housing) + estate_owned_rated) - sum(assets_renting);
        assets_k = (sum(assets_housing) + estate_owned_rated) / sum(assets_renting);

        monthly_metrics.push({
            month : i+1,
            _assets: copy(assets_renting),
            assets_delta : assets_delta,
            assets_k : assets_k,
            housing_roi : (assets_delta < 0) ? null : (30 * 12 * assets_delta / (loan_term * (total_paid_interest - total_tax_returned)))
        });

        if (estate_owned * Math.pow(1.0+house_rate, i+1) + sum(assets_housing) >= sum(assets_renting))
            months_to_even = Math.min(months_to_even, i);
    };

    // console.log(total_paid_interest, total_tax_returned)
    // console.log('>', estate_owned * Math.pow(1.0+house_rate, loan_term), house_value)

    return {
        renting : {
            monthly : monthly_renting,
            outcome : sum(assets_renting)
        },
        housing : {
            monthly : monthly_housing,
            outcome : sum(assets_housing) + estate_owned * Math.pow(1.0+house_rate, loan_term)
        },
        metrics : {
            monthly : monthly_metrics,
        },
        months_to_even
    };

}

function copy(v, p) {
    if (typeof(v)=="object") {
        if (Array.isArray(v)) {
            return v.map((e)=>{return copy(e, v)})
        } else {
            let o = {};
            for(const k in v) {
                o[k] = copy(v[k], v);
            };
            return o;
        }
    } else if (typeof(v)=="number") {
        return v;
    } else if (typeof(v)=="string") {
        return v;
    } else if (typeof(v)=="boolean") {
        return v;
    } else if (typeof(v)=="unedfined") {
        return v;
    } else if (typeof(v)=="function") {
        console.log(p, v);
        throw "attempt to copy a function";
    } else {
        throw "do not know how to copy value: " + v;
    }
}

function calc_assets_no_repayments(asset_params, loan_params) {
    let loan_params_no_repayments = copy(loan_params);
    loan_params_no_repayments.extra_payment_monthly = 0;
    loan_params_no_repayments.extra_payment_value = 0;
    loan_params_no_repayments.extra_payment_value1 = 0;
    loan_params_no_repayments.extra_payment_value2 = 0;
    loan_params_no_repayments.extra_payment_topup = 0;

    let loan_result_no_repayments = calculate_loan(loan_params_no_repayments);
 
    let asset_params_no_repayments = copy(asset_params);
    asset_params_no_repayments.loan_result = loan_result_no_repayments;
    return calc_assets(asset_params_no_repayments);
}

document.addEventListener('DOMContentLoaded', function() {
    recalc_tag[0] = document.getElementsByClassName("recalc_button")[0].innerHTML;
    init_tabs();
    init_fields();

    let plotly_waiter = ()=>{
        if (window.Plotly===undefined) {
            setTimeout(plotly_waiter, 200);
        } else {
            setTimeout(recalculate_fields, 200);
        };
    };
    plotly_waiter();
});