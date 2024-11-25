
function init_tabs() {
    Array.from(document.getElementsByClassName("tabs")).map((div)=>{
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

        Object.keys(tabs).map((name)=>{
            tabs[name].addEventListener("click", ((theblock)=>{
                return ()=>{
                    Object.keys(blocks).map((block)=>{
                        blocks[block].classList.remove("is-visible");
                    });
                    blocks[theblock].classList.add("is-visible");

                    Object.keys(tabs).map((tab)=>{
                        tabs[tab].classList.remove("is-active");
                    });
                    tabs[theblock].classList.add("is-active");
                };
            })(
                name,
            ));

            if (tabs[name].classList.contains("is-active"))
                tabs[name].click();
        });
    });
    
}

function get_parameters(formula) {
    let params = [];
    if (formula===undefined) return params;

    const rg=/([a-zA-Z_\.]+)\(([^\)]*)\)(\.[a-zA-Z_]+)*/g;

    for (const match of formula.matchAll(rg)) {
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

    Object.keys(FIELDS).map((id)=>{
        let fdesc = FIELDS[id];
        if (fdesc.input!==undefined) {
            if ( (!fdesc.input.disabled) && (fdesc.input.value != fdesc.dom.dataset['default']) ) {
                str_state += (str_state=="") ? "?" : "&";
                str_state += `${id}=${fdesc.input.value}`;
            };
        }
    });    

    if (str_state!="") {
        window.history.pushState({page: ""}, "", window.location.pathname.split('/').pop() + str_state);
    };
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
        if (field.id in FIELDS) 
            throw `duplicate field id ${field.id}`

        let input = field.getElementsByTagName("input")[0];

        if (input===undefined) {

        } else {
            if (field.dataset["formula"]!==undefined) {
                input.disabled = true;
            } else {
                if (saved_state[field.id]!==undefined) {
                    input.value = saved_state[field.id];
                } else if (field.dataset['default']!==undefined) {
                    input.value = field.dataset['default'];
                };
                input.addEventListener("wheel", (e)=>{
                    let tune = e.target.parentNode.parentNode.dataset['tune'];
                    if ((tune)&&(e.shiftKey)) {
                        let value = get_field_value(e.target.parentNode.parentNode.id, "");
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
            }
            field.title = input.disabled ? `${field.id} = ${field.dataset["formula"]}` : field.id;
        };

        FIELDS[field.id] = {
            "id" : field.id,
            "input" : input,
            "formula" : field.dataset["formula"],
            //"value" : (input.value!="") ? "" : 1.0*input.value,
            "params" : get_parameters(field.dataset["formula"]),
            "dom" : field
        }
    });
}

function evalInScope(js, contextAsScope) {
    return function() { 
        with(this) { return eval(js); }; 
    }
    .call(contextAsScope);
}

function gather_param_values(params, path) {
    let calculation_context = {};

    let error = undefined;
    for(let i=0; i < params.length; i++) {
        const param_name = params[i];

        if (path.includes(`[${param_name}]`))
            throw `cyclic dependency:  ${path}->${param_name}`

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
    if (fdesc===undefined) throw `undefined parameter ${id} requested from path ${path}`;

    let value = (fdesc.input===undefined) ? fdesc.value : fdesc.value||fdesc.input.value;

    if (fdesc.input!==undefined) { // user input field
        if (!fdesc.input.disabled) {
            if (value=="") {
                console.log(`field ${id} value must be specified`);
                return undefined;
            } else if (/[\+-\/\*\(\)]/g.test(value)) { // ad-hoc formula
                return 1.0*evalInScope(value, {});
            };
            return 1.0*value;
        }
    };
    
    // calculatable field
    if ((value!==undefined)&&(value!=""))
        return value;

    let {calculation_context, error} = gather_param_values(fdesc.params, path);

    if (error) {
        fdesc.input.value = error;
        throw error;
    } else {
        try {
            value = evalInScope(fdesc.formula, calculation_context);
            if (fdesc.input===undefined) {
                fdesc.value = value;
            } else {
                fdesc.input.value = Math.round(100.0 * value)/100.0;
                fdesc.value = value;
            };
        } catch (ex) {
            if (fdesc.input!==undefined)
                fdesc.input.value = `Error in formula: ${ex.message}`;
            throw ex;
        }
    }

    console.log(id, value);
    return value;
}

function recalculate_fields() {
    // cleanup
    Object.keys(FIELDS).map((id)=>{
        let fdesc = FIELDS[id];
        if (fdesc.input===undefined) {
            fdesc.value = undefined;
        } else {
            if (fdesc.input.disabled) {
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

    document.title = `${get_field_value("loan")}  [${get_field_value("loan_type")}:${get_field_value("tax_scheme")}]`;
    document.title += ` ${get_field_value("loan_term_actual")} * ${Math.round(get_field_value("payment_first"))}`;
    document.title += ` / ${Math.round(get_field_value("total_paid_net_monthly"))}`;
    document.title += ` / ${Math.round(100 * get_field_value("assets_delta")) / 100}`;
}

function loan_schedule(loan_params) {
    let result = calculate_loan(loan_params);
    let schedule_dom = document.querySelectorAll("div[data-block='schedule']")[0];
    schedule_dom = schedule_dom.getElementsByClassName("column")[0];
    schedule_dom.innerHTML="";

    let table = document.createElement("table");

    let thead = document.createElement("thead");
    let tr = document.createElement("tr");
    Object.keys(result.monthly[0]).map((key)=>{
        let th = document.createElement("th");
        th.textContent=key;
        tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);

    let tbody = document.createElement("tbody");

    result.monthly.map((record)=>{
        tr = document.createElement("tr");

        Object.keys(record).map((key)=>{
            let td = document.createElement("td");
            td.textContent = Math.round(100*record[key])/100;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    schedule_dom.appendChild(table);
    console.log(result);
}

function graph_payments(loan_params) {
    let result = calculate_loan(loan_params);

    let months = result.monthly.map((record)=>{
        return Math.round(100*record["month"])/100
    });

    let data =  Object
    .keys(result.monthly[0])
    .filter((v)=>{return v!='month'})    
    .map((key)=>{
        return {
            x : months,
            y : result.monthly.map((record)=>{
                return Math.round(100*record[key])/100
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


function graph_assets(asset_params, rent, monthly_ownership_tax, loan, house_price, house_market_rate) {
    let result_renting = calc_assets_renting(asset_params, rent);
    let result_housing = calc_assets_housing(asset_params, monthly_ownership_tax, loan, house_price, house_market_rate);

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
                return Math.round(100*record[key])/100
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
                return Math.round(100*record[key])/100
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


function loan_stats(loan_params) {
    let result = calculate_loan(loan_params);
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

function calc_assets_renting({current_assets, deposit_rate, monthly_salary, loan_result, loan_term, savings, bonus_month, bonus},  rent) {
    let deposit_rate_m = deposit_rate/(100*12);
    let loan_term_actual = loan_result.monthly.length;
    let increment = 0;
    let monthly = [];

    let assets = current_assets;

    for(let i=0; i<loan_term; i++) {
        assets += assets * deposit_rate_m;
        increment = monthly_salary - rent + ((((i%12)+1)==bonus_month)?bonus:0);
        if (increment<0) console.warn(`Renting: Monthly asset increment is negative, month:${i+1}, increment ${increment}`);
        assets += increment;
        if (assets<0) console.warn(`Renting: Asset balance is negative, month:${i+1}`);
        monthly.push({
            month : i+1,
            increment, assets
        });
    };

    return {
        monthly : monthly,
        outcome : assets
    };
}

function calc_assets_housing({current_assets, deposit_rate, monthly_salary, loan_result, loan_term, savings, bonus_month, bonus}, monthly_ownership_tax, loan, house_price, house_market_rate) {
    let deposit_rate_m = deposit_rate/(100*12);
    let loan_term_actual = loan_result.monthly.length;
    let increment = 0;
    let monthly = [];

    let assets = current_assets - savings;

    let house_rate = house_market_rate/(100*12);
    let estate_owned = house_price - loan;

    for(let i=0; i<loan_term; i++) {
        let payment = (i < loan_term_actual) ? loan_result.monthly[i] : {total_payment:0, tax_return:0, capital_payment:0};
        assets += assets * deposit_rate_m;
        increment = monthly_salary - monthly_ownership_tax + payment.tax_return - payment.total_payment + ((((i%12)+1)==bonus_month)?bonus:0);
        if (increment<0) console.warn(`Housing: monthly asset increment is negative, month:${i+1}, increment ${increment}`);
        assets += increment;

        estate_owned += payment.capital_payment;

        house_price += house_price * house_rate;
        if (assets<0) console.warn(`Housing: Asset balance is negative, month:${i+1}`);
        monthly.push({
            month : i+1,
            increment, assets,
            estate_owned : estate_owned*Math.pow(1.0+house_rate, i+1),
            total_assets : estate_owned*Math.pow(1.0+house_rate, i+1) + assets
        });
    };

    return {
        monthly : monthly,
        outcome : assets + house_price
    };
}

document.addEventListener('DOMContentLoaded', function() {
    init_tabs();
    init_fields();
    recalculate_fields();
});