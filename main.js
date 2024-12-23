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
                return a
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

    const rg_fld=/([a-zA-Z_][a-zA-Z0-9_]*)(\.[a-zA-Z_][a-zA-Z0-9_]*)+/g; // structure.field
    for (const match of formula.matchAll(rg_fld)) {
        const sub = match[0];
        if (match[1]!="Math") {
            params.push(match[1]);
            formula = formula.replaceAll(sub," ");
        }
    };

    const rg_fn=/([a-zA-Z_\.]+)\(([^\)]*)\)(\.[a-zA-Z_]+)*/g; // function().field call
    for (const match of formula.matchAll(rg_fn)) {
        const sub = match[0];
        get_parameters(match[2]).map((p)=>{
            params.push(p);
        });
        formula = formula.replaceAll(sub," ");
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
function recalculate_fields(direct) {
    let button = document.getElementById("recalc_button");

    button.innerHTML = "..calculation error: check console..";

    if (!direct) {
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

    let wf = document.querySelectorAll("div[data-block='whatif']")[0];
    if (wf.classList.contains("is-visible") && (!direct)) {
        graph_whatif();
    };

    if (!direct) {
        button.innerHTML = recalc_tag[0];
    };
    
    if (!direct) {
        document.title = `${get_field_value("loan")}  [${get_field_value("loan_type")}:${get_field_value("tax_scheme")}]`;
        document.title += ` ${get_field_value("loan_term_actual")} * ${Math.round(get_field_value("payment_first"))}`;
        document.title += ` / ${Math.round(get_field_value("total_paid_net_monthly"))}`;
        document.title += ` / ${Math.round(100 * get_field_value("assets_delta")) / 100}`;
        document.title += ` / ${Math.round(100 * get_field_value("assets_roi")) / 100}`;
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
    function extre_payment_adjuster(event) {
        let old_value = event.target.innerHTML;
        let new_value = prompt("Enter adjusted extra payment value", old_value);
        if ((new_value!=old_value)&&(new_value!==undefined)&&(new_value!="")&&(new_value!=null)) {
            OVERRIDES[event.target.id] = new_value*1;
            recalculate_fields(true)
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
                td.addEventListener("click", extre_payment_adjuster);
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

    let months = result_renting.monthly.map((record)=>{
        return Math.round(100*record["month"])/100
    });

    let data =  Object
    .keys(result_renting.monthly[0])
    .filter((v)=>{return v!='month'})    
    .map((key)=>{
        return {
            x : months,
            y : result_renting.monthly.map((record)=>{
                return record[key]
            }),
            type: 'scatter',
            name: key+"_renting",
            visible: key=="debt" ? 'legendonly' : undefined
        }
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
    let original_parametetrs = {};
    
    let tmp = gather_param_values(all_parameters, "").calculation_context;
    Array.from(Object.keys(tmp)).map((key)=>{
        original_parametetrs[key + "_0"] = tmp[key];
    });

    function get_metric_value(metric) {
        return eval_if_needed(metric, ()=>{
            let {calculation_context, error} = gather_param_values(all_parameters, "");
            if (error) console.error("Error while calculating context:", error);
            add(calculation_context, original_parametetrs);
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

    Plotly.newPlot("graph_whatif_target", data, layout);
}

function loan_stats(loan_result) {
    let result = loan_result;
    return {
        "payment_first" : result.monthly[0].total_payment - result.monthly[0].extra_payment2,
        "payment_last" : result.monthly[result.monthly.length-1].total_payment- result.monthly[result.monthly.length-1].extra_payment2,
        "total_paid_gross" : result.total_paid_gross,
        "total_paid_net" : result.total_paid_gross - result.total_tax_returned,
        "total_tax_returned" : result.total_tax_returned,
        "total_paid_extra" : result.total_paid_extra,
        "total_paid_penalty" : result.total_penalty,
        "actual_term" : result.monthly.length,
    }
}

function calc_assets({current_assets, deposit_rate, monthly_savings, loan_result, loan_term, savings, bonus_month, bonus, rent, monthly_ownership_tax, loan, house_value, house_market_rate}) {
    let deposit_rate_m = deposit_rate/(100*12);
    let loan_term_actual = loan_result.monthly.length;

    let increment_renting = 0;
    let increment_housing = 0;

    let monthly_renting = [];
    let monthly_housing = [];

    let assets_renting = current_assets;
    let assets_housing = current_assets - savings;

    let house_rate = house_market_rate / (100*12);
    let estate_owned = house_value - loan;

    let months_to_even = loan_term;

    for(let i=0; i<30*12; i++) {
        let payment = (i < loan_term_actual) ? loan_result.monthly[i] : {total_payment:0, tax_return:0, capital_payment:0};

        assets_renting += assets_renting * deposit_rate_m;
        assets_housing += assets_housing * deposit_rate_m;

        increment_renting = monthly_savings + ((((i%12)+1)==bonus_month)?bonus:0);
        if (increment_renting<0) console.warn(`monthly increment_renting is negative, month:${i+1}, increment ${increment_renting}`);
        assets_renting += increment_renting;
        if (assets_renting<0) console.warn(`Renting: Asset balance is negative, month:${i+1}`);
        monthly_renting.push({
            month : i+1,
            increment: increment_renting,
            total_assets: assets_renting
        });

        increment_housing = monthly_savings + rent - monthly_ownership_tax + payment.tax_return - payment.total_payment + ((((i%12)+1)==bonus_month)?bonus:0);
        if (increment_housing < 0) console.warn(`monthly increment_housing is negative, month:${i+1}, increment ${increment_housing}`);
        assets_housing += increment_housing;
        if (assets_housing < 0) console.warn(`Housing: Asset balance is negative, month:${i+1}`);
        estate_owned += payment.capital_payment;
        house_value += house_value * house_rate;
        monthly_housing.push({
            month : i+1,
            increment: increment_housing,
            total_assets : estate_owned * Math.pow(1.0+house_rate, i+1) + assets_housing,
            liquid_assets : assets_housing,
            estate_owned : estate_owned * Math.pow(1.0+house_rate, i+1),
        });

        if (estate_owned * Math.pow(1.0+house_rate, i+1) + assets_housing >= assets_renting)
            months_to_even = Math.min(months_to_even, i);
    };

    return {
        renting : {
            monthly : monthly_renting,
            outcome : assets_renting
        },
        housing : {
            monthly : monthly_housing,
            outcome : assets_housing + house_value
        },
        months_to_even
    };

}

document.addEventListener('DOMContentLoaded', function() {
    recalc_tag[0] = document.getElementById("recalc_button").innerHTML;
    init_tabs();
    init_fields();

    let plotly_waiter = ()=>{
        if (window.Plotly===undefined) {
            setTimeout(plotly_waiter, 200);
            console.log("d");
        } else {
            recalculate_fields();
            console.log("i");
        }; 
    };
    plotly_waiter();
});