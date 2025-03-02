let PROMPTS = {
    "ROUTE" : {
        prompt : ()=>`
Analyze the TEXT and classify it to one of the known categories:
FIN: if TEXT contains mostly description of financial situation of the user for the purposes of mortgage calculations.
EXP: if TEXT is question about specific mortgage: question regarding currently considered mortgage, question about current calculation outcomes, directive to perform analysis of the mortgage, request to provide an opinion on the current mortgage calculation.
QNA: if TEXT is a generic mortgage-related question.
UNK: if TEXT does not falls under FIN or QNA category.

Ensure that your responce contains only the category detected.
Guarantee that output does not includes any extra text, explanations or formatting.
        `,
        format : (input)=>`TEXT to classify: ${input}`,
    },
    "FIN" : {
        prompt : ()=>{
            let PARAMS = LOAN.extract_parameters(LOAN.FIN_PARAMETERS, false);
            console.log("FIN.PARAMS = ", PARAMS);
            return `ENTITIES:\n${PARAMS.join("\n")}

Analyze the TEXT and extract ENTITIES, strictly only if you find them in the TEXT.
Output only valid JSON object. JSON object should contain ONLY ENTITIES detected in the text.
Each value of the JSON object may be an array of unique numbers, the array should be empty if no value found.
Ensure the JSON is correctly formatted with all necessary punctuation, opening and closing and brackets.
Guarantee that output does not includes any extra text, explanations or formatting.`
        },
        format : (input)=>`TEXT to extract ENTITIES from: ${input}`,
        description: "mortgage parameters recognition (cat take a couple of minutes)"
    },
    "EXP" : {
        prompt : ()=>`
You are an experienced mortgage advisor. You will be provided with MORTGAGE_PARAMETERS describing mortgage considered ('buy' scenario), current status ('rent' scenario) and projected financial outcomes of both of these scenarios.
Analyze the MORTGAGE_PARAMETERS and provide a short and concise ANALYSIS of the mortgage. Ensure that ANALYSIS is logically consistent and does not contain factual mistakes.
Optionally, if you see any mortgage-specific questions in the QUERY regarding the situation described - provide short and concise answers. 
        `,
        format : (input)=>{
            let PARAMS = LOAN.extract_parameters(LOAN.EXP_PARAMETERS, true);
            console.log("EXP.PARAMS = ", PARAMS);
            return `MORTGAGE_PARAMETERS:\n${PARAMS.join("\n")}\n\nQUERY: ${input}`;
        },
        description: "analysis of the currently calculated mortgage (can take several minutes)"
    },
    "QNA" : {
        prompt : ()=>`
You are an experienced mortgage advisor. Analyze the QUESTION and provide a short and concise ANSWER.
Ensure that ANSWER is logically consistent and does not contain factual mistakes.
        `,
        format : (input)=>`QUESTION: ${input}`,
        description: "generic mortgages question"
    },
    "UNK" : {
        prompt : ()=>`
Analyze the TEXT and provide a short and concise ANSWER.
Additional information: the tool you are responsible for is mortgage caluclator, it can be used to calculate mortgages.
Ensure that ANSWER is logically consistent and does not contain factual mistakes.
        `,
        format : (input)=>`TEXT: ${input}`,
        description: "general / unclassified question"
    },
}

let LOAN = {
    EXP_PARAMETERS : [
        "house_price", "total_savings", "downpayment",  
        "loan",  "loan_to_value",  "debt_to_income",
        
        "loan_term", "loan_term_actual",

        "monthly_payment_comparison",
        "monthly_payment_loan", "monthly_payment_rent", "monthly_payment_difference", 

        "monthly_avg_loan_invested",
        
        "assets_renting", "assets_housing",
        "months_to_even",
        "assets_delta", "housing_roi",

        "total_loan_invested", "total_paid_gross", "total_paid_net", "total_paid_interest", 
        "total_tax_returned", "total_interest_percentage"
    ],

    FIN_PARAMETERS : [
        "house_price",
        "downpayment",
        "interest_rate",
        "loan_term",
        "total_cash_savings",
        "monthly_savings",
        "monthly_payment_rent",
    ],

    extract_parameters : (list, with_values) => {
        return list.map((key, ix)=>{
            if (!(key in FIELDS))
                console.warn(key, " is unknown");
            if (FIELDS[key].label === undefined)
                console.warn(key, " has no label");
            if (with_values) {
                let value = get_field_value(key);
                if (FIELDS[key].type != "raw")
                    value = Math.round(value);
                return  `${ix+1}. ${key} (${FIELDS[key].label}: ${FIELDS[key].tip}) = ${value}`;
            } else {
                return  `${ix+1}. ${key} (${FIELDS[key].label}: ${FIELDS[key].tip})`;
            }
        });        
    },

    recalculate : ()=>{
        saveState();
        recalculate_fields();
    }
}

let CHAT = {
    d_log: null,
    d_input: null,
    btn_start: null,
    btn_stop: null,
    locked: true,
    llm: null,
    state: undefined,
    LOG: [],
    speak: (sentence)=>{
        if(window.speechSynthesis!==undefined) {
            window.speechSynthesis.speak(
                new SpeechSynthesisUtterance(sentence)
            );
        }
    },
    llm_exec: (cmd)=>{
        if (CHAT.llm)
            CHAT.llm.contentWindow.postMessage(cmd, "*");
    },
    set_state: (state) => {
        CHAT.state = state;
        if (state in PROMPTS) {
            CHAT.llm_exec({
                type: "set", target: "system", 
                value: PROMPTS[state].prompt()
            });
        }
    },
    initiate: (mt) => {
        let introduction = `
        Hi,
        <br><br>
        To begin the process - start with explaining your current situation, more details you can provide - the better.
        <br><br>
        i.e. describe:<br>
        &bull; what are your current total savings<br>
        &bull; how much you save on a monthly basis<br>
        &bull; what rent do you pay on a monthly basis<br>
        &bull; what is the price of the property you look to buy<br>
        &bull; how much of that price you are ready to pay from your savings (mortgage downpayment)<br>
        &bull; what is mortgage interest rate available to you <br>
        etc..        
        `.split("<br><br>");

        if (!mt) {
            introduction.push("<b style='color:red'>Warning: LLM is working in a single-threaded mode. Answer generation will be very slow.</b>");
            introduction.push("Reloading the page might resolve the issue.");
        };

        CHAT.log("", "ai");

        let feeder = (p)=>{
            CHAT.route({"data":{"type":"token","value":introduction[p]}});
            if (p + 1 < introduction.length) {
                CHAT.log("", "ai");
                setTimeout(((x)=>{return ()=>{feeder(x)}})(p+1), 1000);
            } else {
                CHAT.llm_exec({type:"set", target:"max_tokens", value:4096});
                CHAT.llm_exec({type:"set", target:"temp", value:0.2});
                CHAT.set_state("<init>");
                CHAT.route({data:{type:"status", value:"ready"}});
            }
        };
        feeder(0);
    },

    LAST_AI_RESPONSE : null, 
    route: (e) => {
        let m = e.data;
        if (m.type=="status") {
            if (m.value=="") {
            
            } else if (m.value=="loading") {
                CHAT.log(m.value, "status");
            
            } else if (m.value=="loaded") {
                CHAT.log(m.value, "status");
                document.getElementById("chat_start").remove();
                CHAT.llm_exec({type: "init"});

            } else if (m.value=="downloading") {
                CHAT.log(m.value + `[${m.progress}%]`, "status");

            } else if (m.value == "ready") {
                if (CHAT.state === undefined) {
                    CHAT.LAST_MESSAGE.remove();
                    CHAT.initiate(m.mt);

                } else if (CHAT.state === "ROUTE") {
                    const intent = CHAT.LAST_AI_RESPONSE;
                    console.log("ROUTE:", intent);
                    if (intent in PROMPTS) {
                        CHAT.set_state("");
                        CHAT.route({"data":{type:"token", value:"generating response for: " + PROMPTS[intent].description+""}});
                        CHAT.log("", "ai");
                        CHAT.set_state(intent);
                        CHAT.llm_exec({
                            type:"set", target:"user", 
                            value: PROMPTS[CHAT.state].format(CHAT.LAST_USER_MESSAGE)
                        });
                        CHAT.llm_exec({type:"start_stop"});
                    } else {
                        CHAT.log("Error: unknown intent: " + intent, "status");
                        CHAT.d_input.style['display'] = "block";
                        CHAT.btn_stop.style['display']="none";
                    };

                } else if (CHAT.state === "FIN") {
                    let params = CHAT.LAST_AI_RESPONSE;
                    params = params.replaceAll("```json","");
                    params = params.replaceAll("```","");
                    params = JSON.parse(params);
                    CHAT.set_state("");
                    CHAT.route({"data":{type:"token", value:"recognized mortgage parameters: " + JSON.stringify(params)}});
    
                    // set parameters, notify about each
                    Object.keys(params).map((key)=>{
                        const value = Array.isArray(params[key]) ? params[key][0] : params[key];
                        if (value||((value!="")&&(value==0))) {
                            CHAT.log(`Setting mortgage parameter: ${key} (${FIELDS[key].label}) = ${params[key]}`, "ai");
                            FIELDS[key].input.value = params[key];
                        };
                    });
                    CHAT.log("***", "ai");

                    CHAT.log("Recalculating mortgage", "ai");
                    // run calculation
                    LOAN.recalculate();

                    // re-outing to analysis processing
                    CHAT.LAST_AI_RESPONSE = "EXP";
                    CHAT.LAST_USER_MESSAGE = ".";
                    CHAT.set_state("ROUTE");
                    CHAT.route({type:"status", value:"ready"});
                } else {
                    CHAT.d_input.style['display'] = "block";
                    CHAT.btn_stop.style['display']="none";
                    CHAT.set_state("ROUTE");
                };
            };

        } else if (m.type=="token") {
            if (CHAT.state=="ROUTE") {
            } else if (CHAT.state=="FIN") {
            } else {
                if (CHAT.LAST_MESSAGE.classList.contains("loading"))
                    CHAT.LAST_MESSAGE.classList.remove("loading");
                CHAT.LAST_MESSAGE.innerHTML = CHAT.LAST_MESSAGE.innerHTML + m.value;
                if (CHAT.locked)
                    CHAT.d_log.scrollTop = CHAT.d_log.scrollHeight;
            };
        } else if (m.type=="sentence") {
            CHAT.speak(m.value);

        } else if (m.type=="response") {
            CHAT.LAST_AI_RESPONSE = m.value.trim();
            if (CHAT.state=="ROUTE") {
            } else if (CHAT.state=="FIN") {
            } else {
                CHAT.LOG.push({type:"ai", text: m.value});
            };
        }
    },

    LAST_USER_MESSAGE : null, 
    process: (query) => {
        CHAT.LAST_USER_MESSAGE = query;        
        CHAT.LOG.push({type:"user", text: query});
        CHAT.log(query, "user");
        CHAT.log("", "ai");
        CHAT.llm_exec({
            type: "set", target: "user",
            value: PROMPTS[CHAT.state].format(query)
        });
        CHAT.llm_exec({type:"start_stop"});
        CHAT.d_input.style['display']="none";
        CHAT.btn_stop.style['display']="block";
    },

    LAST_MESSAGE : null,
    log: (text, from) => {
        const posted = (CHAT.LAST_MESSAGE)&&(CHAT.LAST_MESSAGE.classList.contains(`msg_${from}`));
        if (posted && (from=="status")) {
            msg = CHAT.LAST_MESSAGE;
        } else {
            msg = document.createElement("span");
            msg.classList.add(`msg_${from}`);
            CHAT.d_log.appendChild(msg);
            CHAT.LAST_MESSAGE = msg;
            if ((from=="ai")&&((text==""))) 
                msg.classList.add("loading");
        }
        msg.innerHTML = text;
        if (CHAT.locked)
            CHAT.d_log.scrollTop = CHAT.d_log.scrollHeight;
    }
}

window.addEventListener("message", (e)=>{
    console.log("CHAT received: ", e.data);
    CHAT.route(e);
});

document.addEventListener('DOMContentLoaded',()=>{
    CHAT.d_log = document.getElementById("chat_log");
    CHAT.d_log.addEventListener('scroll',(e)=>{
        CHAT.locked = (CHAT.d_log.scrollHeight - CHAT.d_log.scrollTop  - CHAT.d_log.clientHeight)==0;
        if (CHAT.locked) 
            CHAT.d_log.scrollTop = CHAT.d_log.scrollHeight;
    });

    CHAT.d_input = document.getElementById("chat_input");
    CHAT.d_input.addEventListener("keydown", (e)=>{
        if (e.key === 'Enter' || e.keyCode === 13) {
            CHAT.process(CHAT.d_input.value);
            CHAT.d_input.value = "";
        };
    });

    CHAT.llm = document.getElementById("chat_llm");
    CHAT.llm.addEventListener("load", ()=>{
        console.log("LLM loaded");
    });

    CHAT.btn_start = document.getElementById("chat_start");
    CHAT.btn_start.addEventListener("click", ()=>{
        CHAT.d_log.innerHTML = "";
        CHAT.route({data:{type:"status", "value":"loading"}});
        CHAT['llm'].src = "https://kiryukhin.info/llm.html";
    });

    CHAT.btn_stop = document.getElementById("chat_stop");
    CHAT.btn_stop.addEventListener("click", ()=>{
        CHAT.route({data:{type:"status", "value": "interrupted"}});
        CHAT.llm_exec({type:"start_stop"});
    });

    console.log("CHAT co-isolation:", window.location.hostname, window.crossOriginIsolated)
});


