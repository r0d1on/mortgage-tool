function throw_error(text) {
    console.trace();
    throw text;
}

function get_tabs_state(max_index) {
    let tab_state = "";
    Object.keys(TABS).map((index)=>{
        if (index >= max_index) return;
        if (TABS[index]['activated']!=['mortgage', 'graph_payments'][index]) {
            tab_state += (tab_state=="") ? "?" : "&";
            tab_state += `t_${index}=${TABS[index]['activated']}`;
        };
    });
    return tab_state;
}

function get_mortgage_state() {
    let str_state = "";
    Object.keys(FIELDS).map((id)=>{
        let fdesc = FIELDS[id];
        if (fdesc.input!==undefined) {
            if ( (!fdesc.input.disabled) && (fdesc.input.value != fdesc.field.dataset['default']) ) {
                str_state += (str_state=="") ? "?" : "&";
                str_state += `${id.replaceAll("_","-")}=${fdesc.input.value}`;
            };
        }
    });    
    return str_state;
}

function refresh_canonical() {
    let link = document.querySelectorAll("link[rel=canonical]")[0];
    let base = link.href.split("?")[0];
    link.href = base + get_tabs_state(1);
}

function refresh_title(params) {
    let title = document.title.split(":")[0].replace("(for Netherlands)", "").replace(" payments ", " ");
    title += " : " + TABS[0].tabs[TABS[0].activated].textContent;
    if (params && (get_mortgage_state() != "")) {
        title += " ("
        title += ["", "annuity", "linear", "interest"][get_field_value("loan_type")] + " - ";
        title += get_field_value("house_price");
        title += "/" + get_field_value("savings");
        title += ")";
    };
    document.title = title;
}

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
}

let TABS = {};
function init_tabs(saved_state) {
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
                if (((ix==0)&&(v.dataset["block"]=='mortgage'))||((ix==1)&&(v.dataset["block"]=='graph_payments'))) {
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
                    e.preventDefault();
                    activate_tab(theblock, index);
                    saveState();
                    refresh_canonical();
                    refresh_title(true);
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

    document.getElementById("btn_copy").addEventListener("click",()=>{
        const url = window.location.href;
        if (navigator.share !== undefined) {
            navigator.share({url:url, title:"mortgage calculation"}).then(() => {            
            }).catch(err => {
                alert('Failed to share URL: ', err);
            });
        } else {
            navigator.clipboard.writeText(url).then(() => {
                alert('URL to this calculation copied to clipboard');
            }).catch(err => {
                alert('Failed to copy URL: ', err);
            });
        }
    });
}


function get_parameters(formula) {
    let params = [];
    if (formula===undefined) return params;

    // function().field call
    const rg_fn=/([a-zA-Z_\.]+)\(([^\)]*)\)(\.[a-zA-Z_]+)*/g; 
    for (const match of formula.matchAll(rg_fn)) {
        const sub = match[0];
        get_parameters(match[2]).map((p)=>{
            params.push(p);
        });
        formula = formula.replaceAll(sub," ");
    };

    // structure.field
    const rg_fld=/([a-zA-Z_][a-zA-Z0-9_]*)(\.[a-zA-Z_][a-zA-Z0-9_]*)+/g; 
    for (const match of formula.matchAll(rg_fld)) {
        const sub = match[0];
        if (match[1]!="Math") {
            params.push(match[1]);
            formula = formula.replaceAll(sub," ");
        }
    };

    // string immediates
    const str_imm=/'[^']*'/g; 
    for (const match of formula.matchAll(str_imm)) {
        formula = formula.replaceAll(match[0]," ");
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
    let str_state = get_tabs_state() + get_mortgage_state();
    const url = window.location.pathname.split('/').pop() + str_state;
    window.history.pushState({}, window.title, url);
}

function loadState() {
    let values = {};
    if (window.location.search!="") {
        window.location.search.split("?")[1].split("&").map((kv)=>{
            let kkv = kv.split("=");
            if (kkv[1]!="")
                values[kkv[0].replaceAll("-","_")] = kkv[1];
        })
    }
    return values;
}

function init_fields(saved_state) {
    FIELDS = {};
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

    Array.from(document.getElementsByClassName("tooltip")).map((e)=>{
        e.addEventListener("click", (e)=>{
            if (e.target.getAttribute("visible")) {
                e.target.setAttribute("visible", "");
            } else {
                e.target.setAttribute("visible", 1);
            };
        });
        e.addEventListener("mouseover", (e)=>{
            Array.from(document.getElementsByClassName("tooltip")).map((x)=>{
                x.setAttribute("visible", "");
            });
            e.target.setAttribute("visible", 1);
        });
        e.addEventListener("mouseout", (e)=>{
            e.target.setAttribute("visible", "");
        });
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
            fdesc.value = value;
            if (fdesc.input===undefined) {
            } else if (fdesc.type=='raw') {
                fdesc.input.value = value;
            } else {
                const xp = 10**fdesc.round;
                fdesc.input.value = Math.round(xp * value)/xp;
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

function recalculate_fields(direct, keep_overrides) {
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
        activate_tab("graph_whatif", 1);        
    };

    section = document.querySelectorAll("div[data-block='entry']")[0];
    if (section.classList.contains("is-visible") && (!direct)) {
        graph_entry();
        activate_tab("graph_entry", 1);
    };

    if (!direct)
        refresh_title(true);
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

function get_visibility(pltly_dom_id) {
    let visibility={}
    plot = document.getElementById(pltly_dom_id);
    (plot.data||[]).map((s)=>{
        if (s.visible!==undefined)
            visibility[s.name] = s.visible;
    });
    return visibility;
}

function graph_payments(loan_result) {
    let visibility = get_visibility("graph_payments_target");
    if (visibility['debt']==undefined)
        visibility['debt']='legendonly';

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
            visible: visibility[key]
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
    function plot(data, rows, xs, postfix, visibility) {
        let d = (data===undefined)?[]:data;
        Object
        .keys(rows[0])
        .filter((v)=>{return (v!='month')&&(!v.startsWith("_"))})
        .map((key)=>{
            d.push({
                x : xs,
                y : rows.map((record)=>{
                    return record[key]
                }),
                type: 'scatter',
                name: key+postfix,
                visible: visibility[key+postfix]
            });
        });
        return d;
    }

    let visibility = get_visibility("graph_assets_target");

    let result_renting = assets_result.renting;
    let result_housing = assets_result.housing;
    let result_metrics = assets_result.metrics;

    let months = result_renting.monthly.map((record)=>{
        return Math.round(100*record["month"])/100
    });

    let data = plot(undefined, result_metrics.monthly, months, "", visibility);
    plot(data, result_renting.monthly, months, "_renting", visibility);
    plot(data, result_housing.monthly, months, "_housing", visibility);

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


S = {};
function _defer_cycle(callback) {
    try {
        if (callback(0)===false)
            return callback(1);
    } catch(ex) {
        callback(-1);
        throw ex;
    };
    S.count = (S.count||0) + 1;
    document.getElementById("progress_bar").style['width'] = Math.round(1000 * S.count / S.total_count)/10 + "%";

    if (S.value2!==undefined) {
        S.stage2 += 1;
        S.value2 += S.step2;
    };
    if ((S.value2==undefined)||(S.stage2 > S.range2[2])) {
        if (S.value2!==undefined) {
            S.stage2 = 1;
            S.value2 = S.range2[0];
        }
        S.stage1 += 1;
        S.value1 += S.step1;
    };
    if (S.stage1 > S.range1[2]) {
        return callback(1);
    } else {
        setTimeout(
            ((callback)=>{
                return ()=>{_defer_cycle(callback)}
            })(callback)
            ,50
        );
    }
}

X = {};
function save() {
    X = {};
    X.all_parameters = Array.from(Object.keys(FIELDS));
    X.original_parameters = {};
    
    let tmp = gather_param_values(X.all_parameters, "").calculation_context;
    Array.from(Object.keys(tmp)).map((key)=>{
        X.original_parameters[key + "_0"] = structuredClone(tmp[key]);
        X.original_parameters[key] = structuredClone(tmp[key]);
    });
    Array.from(document.getElementsByClassName("recalc_button")).map((b)=>{
        b.innerHTML = "..calculation in progress..";
    });
    document.getElementById("progress_overlay").style['display'] = "block";
}

function restore(params) {
    params.map((key)=>{
        if (key!==undefined)
            FIELDS[key].input.value = X.original_parameters[key];
    });
    recalculate_fields(true);

    Array.from(document.getElementsByClassName("recalc_button")).map((b)=>{
        b.innerHTML = recalc_tag[0];
    });
    document.getElementById("progress_overlay").style['display'] = "none";
}

function add(target, source) {
    Array.from(Object.keys(source)).map((key)=>{
        if (!(key in target))
            target[key] = source[key]; 
    });        
}

function get_metric_value(metric) {
    return eval_if_needed(metric, ()=>{
        let {calculation_context, error} = gather_param_values(X.all_parameters, "");
        if (error) console.error("Error while calculating context:", error);
        add(calculation_context, X.original_parameters);
        return calculation_context;
    }, (metric)=>{
        return get_field_value(metric)
    });
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
        let step = (range[1]-range[0]) / (range[2]-1);
        return [var_def, range, old_value, step];
    }

    function calc_result() {
        FIELDS[S.variable1].input.value = S.value1;
        if (S.variable2==undefined) { // 2d plot, many metrics
            let result = {};
            result[S.variable1] = S.value1;

            recalculate_fields(true);
            get_field_value("metrics").split(",").map((metric)=>{
                const metric0 = metric.trim();
                result[metric0] = get_metric_value(metric0);
            });
            S.results.push(result);
        
        } else { // 3d surface plot - two parameters, one metric
            FIELDS[S.variable2].input.value = S.value2;
            if (S.result===undefined)
                S.result=[];
            S.xyz={};
            S.xyz[variable1] = S.value1;
            S.xyz[variable2] = S.value2;

            recalculate_fields(true);
            const metric0 = get_field_value("metrics").split(",")[0].trim(); // take first metric
            S.xyz[metric0] = get_metric_value(metric0);
            S.result.push(S.xyz);
            if (S.stage2 == S.range2[2]) {
                S.results.push(S.result);
                S.result=[];
            }
        }
    }

    function plot_results() {
        let data = null;
        let layout = null;

        if (S.variable2==undefined) {
            let xs = S.results.map((record)=>{
                return record[S.variable1];
            });
        
            data =  Object
            .keys(S.results[0])
            .filter((v)=>{return v!=S.variable1})
            .map((key)=>{
                return {
                    x : xs,
                    y : S.results.map((record)=>{
                        return record[key]
                    }),
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: key,
                    //visible: key=="debt" ? 'legendonly' : undefined
                }
            });
        
            layout = {
                title:'What-if modelling : ' + S.variable1,
                xaxis: {
                    title: S.results
                },
                yaxis: {
                    title: 'metrics'
                }
            };

        } else {
            const key = get_field_value("metrics").split(",")[0].trim();
            data = [{
                z: S.results.map((a)=>{return a.map((r)=>{return r[key]})}),
                x: S.results[0].map((r)=>{return r[S.variable2]}),
                y: S.results.map((a)=>{return a[0][S.variable1]}),
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
                    text: 'What-if modelling: ' + key + ", x=" + S.variable2 + ', y=' + S.variable1 + "",
                },
                scene: {camera: {eye: {x: 1.87, y: 0.88, z: 0.84}}},
                width: 700,
                height: 700,
                xaxis: {
                    title: {
                        text: S.variable1,
                    },
                },
                yaxis: {
                    title: {
                        text: S.variable2,
                    }
                }            
            };
        };

        let div_whatif = document.getElementById("graph_whatif_target");
        div_whatif.innerHTML = "";
        Plotly.newPlot("graph_whatif_target", data, layout);        
    }

    save();

    let [variable1, range1, old_value1, step1] = parse_variable("variable1");
    let [variable2, range2, old_value2, step2] = parse_variable("variable2");
    let results = [];

    S = {
        variable1, range1, old_value1, step1,
        variable2, range2, old_value2, step2,
        results
    };
    S.value1 = range1[0];
    S.stage1 = 1;
    S.value2 = (variable2==undefined) ? undefined : range2[0];
    S.stage2 = (variable2==undefined) ? undefined : 1;
    S.total_count = range1[2] * (range2||[1,1,1])[2];

    _defer_cycle((final)=>{
        if (final==-1) {
            alert("Some error encountered, check console for details.");
            restore([S.variable1,S.variable2]);
        } else if (final==1) {
            plot_results();
            restore([S.variable1, S.variable2]);
        } else if (final==0) {
            return calc_result();
        }
    });
}

function graph_entry() {
    function calc_result() {
        let OP = X.original_parameters;
        let result = {};
        let delay = S.value1;
        result["delay"] = delay + 1;

        S.new_params.house_price = OP.house_price * Math.pow(1.0 + S.house_rate, delay+1);
        S.new_params.savings = OP.assets_result.renting.monthly[delay].total_assets * S.downpayment_pct;

        [S.new_params.current_cash_assets, S.new_params.current_stocks_assets] = OP.assets_result.metrics.monthly[delay]._assets;
        if (S.new_params.current_cash_assets >= S.new_params.house_price) {
            S.results.push(result);
            return false;
        };

        S.new_params.bonus_month = (OP.bonus_month) - (delay + 1);
        while (S.new_params.bonus_month<=0) S.new_params.bonus_month += 12;

        S.new_params.extra_payment_start = (OP.extra_payment_start) - (delay + 1);
        if (OP.extra_payment_period>0)
            while (S.new_params.extra_payment_start<=0) S.new_params.extra_payment_start += OP.extra_payment_period;

        Array.from(Object.keys(S.new_params)).map((key)=>{
            FIELDS[key].input.value = S.new_params[key];
        });
        recalculate_fields(true);

        let state = gather_param_values(X.all_parameters, "").calculation_context;
        if (state.loan <= S.new_params.savings * 0.05) {
            S.results.push(result);
            return false;
        };

        // entry parameters
        result["entry_total_assets"] = OP.assets_result.renting.monthly[delay].total_assets;
        result["entry_savings"] = S.new_params.savings;
        result["entry_house_price"] = S.new_params.house_price;

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
            let r = state.assets_result.housing.monthly[S.probe_month - delay - 2];
            if (r!==undefined)
                result["housing_" + metric + "@" + S.probe_month] = r[metric];
        });

        // loan internal parameters, metrics
        [
            "housing_roi", "assets_k", "assets_delta" 
        ].map((metric)=>{
            let r = state.assets_result.metrics.monthly[S.probe_month - delay - 2];
            if (r!==undefined)
                result[metric + "@" + S.probe_month] = r[metric];
        });

        S.results.push(result);
    }

    function plot_results() {
        let data = null;
        let layout = null;
    
        let xs = S.results.map((record)=>{
            return record["delay"];
        });
    
        data =  Object
        .keys(S.results[0])
        .filter((v)=>{return v!="delay"})
        .map((key)=>{
            return {
                x : xs,
                y : S.results.map((record)=>{
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
                title: S.results
            },
            yaxis: {
                title: 'metrics'
            }
        };

        let div_entry = document.getElementById("graph_entry_target");
        div_entry.innerHTML = "";
        Plotly.newPlot("graph_entry_target", data, layout);        
    }

    save();

    S = {
        value1: 0,
        stage1: 1,
        step1: 1,
        range1: [0, X.original_parameters.loan_term-1, X.original_parameters.loan_term],
        results : [],
        new_params : {},
        house_rate : X.original_parameters.house_market_rate / (100 * 12),
        downpayment_pct : X.original_parameters.assets_to_downpayment / 100,
        probe_month : get_metric_value("entry_probe_month")
    };
    S.total_count = X.original_parameters.loan_term;

    _defer_cycle((final)=>{
        if (final==-1) {
            alert("Some error encountered, check console for details.");
            restore(Array.from(Object.keys(S.new_params)));
        } else if (final==1) {
            plot_results();
            restore(Array.from(Object.keys(S.new_params)));
        } else if (final==0) {
            return calc_result();
        }
    });
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
        let payment = (i < loan_term_actual) ? loan_result.monthly[i] : {net_payment:0, tax_return:0, capital_payment:0, interest_amt:0};
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

        increment_housing = monthly_savings + rent - monthly_ownership_tax - payment.net_payment;
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
            _assets: structuredClone(assets_renting),
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

function calc_assets_no_repayments(asset_params, loan_params) {
    let loan_params_no_repayments = structuredClone(loan_params);
    loan_params_no_repayments.extra_payment_monthly = 0;
    loan_params_no_repayments.extra_payment_value = 0;
    loan_params_no_repayments.extra_payment_value1 = 0;
    loan_params_no_repayments.extra_payment_value2 = 0;
    loan_params_no_repayments.extra_payment_topup = 0;

    let loan_result_no_repayments = calculate_loan(loan_params_no_repayments);
 
    let asset_params_no_repayments = structuredClone(asset_params);
    asset_params_no_repayments.loan_result = loan_result_no_repayments;
    return calc_assets(asset_params_no_repayments);
}

let recalc_tag = ["Recalculate"];
let saved_state = loadState();

document.addEventListener('DOMContentLoaded', function() {
    recalc_tag[0] = document.getElementsByClassName("recalc_button")[0].innerHTML;
    init_tabs(saved_state);
    refresh_canonical();
    refresh_title();
    init_fields(saved_state);

    let plotly_waiter = ()=>{
        if (window.Plotly===undefined) {
            setTimeout(plotly_waiter, 200);
        } else {
            setTimeout(recalculate_fields, 200);
        };
    };
    plotly_waiter();
});