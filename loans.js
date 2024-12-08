
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

function calculate_loan_payments(loan_params, ICB) {
  let debt = loan_params.loan;
  let actual_extra_payments = 0;
  let penalty = 0;

  let lp = structuredClone(loan_params);

  let monthly = [];
  
  for(let i=0; i<lp.loan_term; i++) {
    if (i%12==0)
      actual_extra_payments = 0;

    let {base_payment, capital_payment, interest_amt} = ICB(lp, debt, i);

    let extra_payment = lp.extra_payment_monthly;
    let extra_payment2 = 0;
    
    let tax_return = 0;
    if (lp.tax_scheme > 0) {
      tax_return = (interest_amt) * (lp.deduction  / 100.0);
      if (lp.tax_scheme==2) {
        extra_payment += tax_return;
        tax_return = 0;
      };
  
      if (i==0) {
        tax_return += (lp.purchase_deductible_cost) * (lp.deduction  / 100.0);
        if (lp.tax_scheme==2) {
          extra_payment2 += tax_return;
          tax_return = 0;
        };
      };
    };

    ["", "1", "2"].map((ix)=>{
      lp['extra_payment_start'+ix] -= 1;
      if (lp['extra_payment_start'+ix]==0) {
        lp['extra_payment_start'+ix] = lp['extra_payment_period'+ix];
        extra_payment2 += lp['extra_payment_value'+ix];
      };
    });

    if (base_payment + extra_payment + extra_payment2 + penalty < lp.extra_payment_topup) {
      extra_payment += lp.extra_payment_topup - (base_payment + extra_payment + extra_payment2 + penalty)
    };

    if (capital_payment + extra_payment + extra_payment2 > debt) {
      extra_payment = Math.min(extra_payment, Math.max(0, debt - capital_payment));
      extra_payment2 = Math.max(0, debt - capital_payment - extra_payment);
      capital_payment = debt - extra_payment - extra_payment2;
    };

    if (("xp_"+(i+1)) in OVERRIDES) {
      extra_payment = OVERRIDES["xp_"+(i+1)];
    };

    actual_extra_payments += extra_payment + extra_payment2;
    if (actual_extra_payments > lp.max_extra_payment_per_year) {
      penalty = (actual_extra_payments - lp.max_extra_payment_per_year) * (lp.overpayment_penalty / 100);
      actual_extra_payments -= extra_payment + extra_payment2;
      [extra_payment, extra_payment2] = [
        extra_payment - penalty * extra_payment / (extra_payment + extra_payment2),
        extra_payment2 - penalty * extra_payment2 / (extra_payment + extra_payment2)
      ];
      if (lp.overpayment_penalty == 100) {
        penalty = 0;
      };
      actual_extra_payments += extra_payment + extra_payment2;
    } else {
      penalty = 0;
    };

    capital_payment += extra_payment + extra_payment2;

    let total_payment = base_payment + extra_payment + extra_payment2 + penalty;
    const net_payment = total_payment - tax_return;

    monthly.push({
      month: i + 1,
      debt,
      base_payment,
      capital_payment,
      interest_amt,
      extra_payment,
      extra_payment2,
      tax_return,
      net_payment,
      penalty,
      total_payment,
    });

    debt -= capital_payment;
    if (debt <= 0)
      break;
  };

  return monthly
}

function calculate_loan(loan_params) {
    let monthly = [];
    if (loan_params.loan_type==1) { // annuity
        monthly = calculate_loan_payments(loan_params, (lp, debt, i)=>{
          // let base_payment = -PMT(lp.interest / (12 * 100), lp.loan_term, lp.loan);
          let base_payment = -PMT(lp.interest / (12 * 100), lp.loan_term - i, debt);
          let interest_amt = -IPMT(debt, base_payment, lp.interest / (12 * 100), 1);
          let capital_payment = base_payment - interest_amt;
          return {base_payment, capital_payment, interest_amt} 
        });

    } else if (loan_params.loan_type==2) { // linear
        monthly = calculate_loan_payments(loan_params, (lp, debt, i)=>{
        let capital_payment = lp.loan / lp.loan_term;
        let interest_amt = debt * lp.interest / (12 * 100);
        let base_payment = capital_payment + interest_amt;
        if (capital_payment > debt) {
          capital_payment = debt;
          base_payment = interest_amt + debt;
        };
        return {base_payment, capital_payment, interest_amt} 
      });

    } else if (loan_params.loan_type==3) { // interest-only
        loan_params.tax_scheme = 0; // interest-only loans do not grant tax returns
        monthly = calculate_loan_payments(loan_params, (lp, debt, i)=>{
          let capital_payment = (i==lp.loan_term-1) ? lp.loan : 0;
          let interest_amt = debt * lp.interest / (12 * 100);
          let base_payment = capital_payment + interest_amt;
          if (capital_payment > debt) {
            capital_payment = debt;
            base_payment = interest_amt + debt;
          };
          return {base_payment, capital_payment, interest_amt} 
        });
  
    } else {
        throw `unknown loan_type value (${loan_params.loan_type}), it must be in [1,2,3]`;
    };

    return {
      monthly: monthly,
      total_paid_gross: monthly.reduce((s, r)=>{return s + r.total_payment}, 0),
      total_paid_extra: monthly.reduce((s, r)=>{return s + r.extra_payment + r.extra_payment2}, 0),
      total_tax_returned: monthly.reduce((s, r)=>{return s + r.tax_return}, 0),
      total_penalty: monthly.reduce((s, r)=>{return s + r.penalty}, 0),
    };

}
