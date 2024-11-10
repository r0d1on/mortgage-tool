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
                a[v.dataset['block']]=v;
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
    .split(/[:> \?\d\*\.\+\-\/,\(\)]/g)
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
        if ( (!fdesc.input.disabled) && (fdesc.input.value != fdesc.dom.dataset['default']) ) {
            str_state += (str_state=="") ? "?" : "&";
            str_state += `${id}=${fdesc.input.value}`;
        };
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
    let value = fdesc.input.value;

    if (!fdesc.input.disabled) { // user input field
        if (value=="") {
            console.log(`field ${id} value must be specified`);
            return undefined;
        } else if (/[\+-\/\*\(\)]/g.test(value)) {
            return 1.0 * evalInScope(value, {});
        };
        return 1.0*value;
    };
    
    if (fdesc.input.value!="")
        return 1.0*value;

    let {calculation_context, error} = gather_param_values(fdesc.params, path);

    if (error) {
        fdesc.input.value = error;
        throw error;
    } else {
        try {
            value = evalInScope(fdesc.formula, calculation_context);
            fdesc.input.value = Math.round(100.0 * value)/100.0;
        } catch (ex) {
            fdesc.input.value = `Error in formula: ${ex.message}`;
            throw ex;
        }
    }

    console.log(id, fdesc.input.value);

    return 1.0 * fdesc.input.value;
}

function recalculate_fields() {
    // cleanup
    Object.keys(FIELDS).map((id)=>{
        let fdesc = FIELDS[id];
        if (fdesc.input!==undefined) {
            if (fdesc.input.disabled) 
                fdesc.input.value = "";
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
}


function PMT(rate, nperiod, amount) {
    if (rate === 0) return -amount / nperiod;
    var pvif = Math.pow(1 + rate, nperiod);
    var pmt = (rate / (pvif - 1)) * -(amount * pvif);
    return pmt;
}

function IPMT(pv, pmt, rate, per) {
    var tmp = Math.pow(1 + rate, per - 1);
    return 0 - (pv * tmp * rate + pmt * (tmp - 1));
}

function PPMT(rate, per, nper, pv) {
    var pmt = PMT(rate, nper, pv);
    var ipmt = IPMT(pv, pmt, rate, per);
    return pmt - ipmt;
}

function calculate_loan_linear(loan_term, interest, deduction, loan) {
    const capital_payment = loan / loan_term;

    let paid_gross = 0;
    let paid_net = 0;
    const monthly = Array(loan_term)
      .fill(0)
      .map((v, i) => {
        const balance = loan - capital_payment * i;
        const interest_amt = balance * (interest / (12 * 100));
        const gross_payment = capital_payment + interest_amt;
        const tax_deduction = (interest_amt * deduction) / 100;
        const net_payment = gross_payment - tax_deduction;
        paid_net += net_payment;
        paid_gross += gross_payment;
        return {
          month: i + 1,
          balance,
          gross_payment,
          capital_payment,
          interest_amt,
          tax_deduction,
          net_payment,
        };
      });

    return {
        monthly,
        total: {
                paid_gross,
                paid_net,
            },
    };
}

function calculate_loan_annuity(loan_term, interest, deduction, loan) {
    const rate = interest / (12 * 100);
  
    let paid_gross = 0;
    let paid_net = 0;
    let capital_paid = 0;

    const monthly = Array(loan_term)
      .fill(0)
      .map((v, i) => {
        let balance = loan - capital_paid;
        balance = Math.max(balance, 0);
        const pmt = PMT(rate, loan_term - i, balance);
        const interest_amt = -IPMT(balance, pmt, rate, 1);
        const capital_payment = -PPMT(rate, 1, loan_term - i, balance);
        const gross_payment = capital_payment + interest_amt;
        paid_gross += gross_payment;
        const tax_deduction = (interest_amt * deduction) / 100.0;
        const net_payment = gross_payment - tax_deduction;
        paid_net += net_payment;
        capital_paid += capital_payment;

        return {
          month: i + 1,
          balance,
          gross_payment,
          capital_payment,
          interest_amt,
          tax_deduction,
          net_payment, 
        };
      });
  
    return {
        monthly,
        total: {
                paid_gross,
                paid_net,
            },
    };    
}

function calculate_loan(loan_type, loan_term, interest, deduction, loan) {
    if (loan_type==1) {
        return calculate_loan_annuity(loan_term, interest, deduction, loan);
    } else if (loan_type==2) {
        return calculate_loan_linear(loan_term, interest, deduction, loan);
    } else {
        throw "unknown loan_type value, it must be '1' or '2'";
    };
}


function loan_schedule(loan_type, loan_term, interest, deduction, loan) {
    let result = calculate_loan(loan_type, loan_term, interest, deduction, loan);
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


function loan_graph(loan_type, loan_term, interest, deduction, loan) {
    let result = calculate_loan(loan_type, loan_term, interest, deduction, loan);

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
            visible: key=="balance" ? 'legendonly' : undefined
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

    

    Plotly.newPlot("graph_target", data, layout);
}

function loan_stats(loan_type, loan_term, interest, deduction, loan) {
    let result = calculate_loan(loan_type, loan_term, interest, deduction, loan);
    return {
        "payment_first_gross" : result.monthly[0].gross_payment,
        "payment_first_net" : result.monthly[0].net_payment,
        "payment_last_gross" : result.monthly[loan_term-1].gross_payment,
        "payment_last_net" : result.monthly[loan_term-1].net_payment,
    }
}

window.addEventListener("load", (event) => {
    init_tabs();
    init_fields();
    recalculate_fields();
});