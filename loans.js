
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


function calculate_loan_interest_only({loan_term, interest, deduction, loan, tax_scheme, extra_payment_monthly, extra_payment_period, extra_payment_start, extra_payment_value, extra_payment_period1, extra_payment_start1, extra_payment_value1, extra_payment_period2, extra_payment_start2, extra_payment_value2, max_extra_payments_per_year_pct, overpayment_penalty}) {
  const rate = interest / (12 * 100);

  let total_paid_gross = 0;
  let total_paid_extra = 0;
  let total_tax_returned = 0;
  let total_penalty = 0;
  let debt = loan;
  let max_extra_payments_per_year = (max_extra_payments_per_year_pct/100) * loan;
  let actual_extra_payments_per_year = 0;
  let penalty = 0;

  let capital_payment_m = 0;

  let monthly = [];
  for(let i=0; i<loan_term; i++) {
    if (i%12==0)
      actual_extra_payments_per_year = 0;

    let capital_payment = capital_payment_m;
    const interest_amt = debt * rate;
    let base_payment = capital_payment + interest_amt;
    if (capital_payment > debt) {
      capital_payment = debt;
      base_payment = interest_amt + debt;
    };

    let tax_return = 0;
    let extra_payment = extra_payment_monthly;
    if (tax_scheme==1) {
      tax_return = 0;
    } else if (tax_scheme==2) {
      extra_payment += 0;
    };
    extra_payment_start -= 1;
    if (extra_payment_start==0) {
      extra_payment_start = extra_payment_period;
      extra_payment += extra_payment_value;
    };
    extra_payment_start1 -= 1;
    if (extra_payment_start1==0) {
      extra_payment_start1 = extra_payment_period1;
      extra_payment += extra_payment_value1;
    };
    extra_payment_start2 -= 1;
    if (extra_payment_start2==0) {
      extra_payment_start2 = extra_payment_period2;
      extra_payment += extra_payment_value2;
    };

    if (base_payment*2 > debt) {
      extra_payment = 0;
    };      
    if (capital_payment + extra_payment > debt) {
      extra_payment = debt - capital_payment;
    };
    actual_extra_payments_per_year += extra_payment;
    if (actual_extra_payments_per_year > max_extra_payments_per_year) {
      penalty = extra_payment * (overpayment_penalty / 100);
      extra_payment -= penalty;
    } else {
      penalty = 0;
    };

    capital_payment += extra_payment;


    let total_payment = base_payment + extra_payment + penalty;
    const net_payment = total_payment - tax_return;

    total_paid_gross += total_payment;
    total_tax_returned += tax_return;
    total_paid_extra += extra_payment;
    total_penalty += penalty;

    if (i==loan_term-1)
      capital_payment = debt;

    monthly.push({
      month: i + 1,
      debt,
      base_payment,
      capital_payment,
      interest_amt,
      extra_payment,
      tax_return,
      net_payment, 
      penalty,
      total_payment,
    });

    debt -= capital_payment;
    if (debt <=0)
      break;

  };

  return {
      monthly,
      total_paid_gross,
      total_paid_extra,
      total_tax_returned,
      total_penalty,
  };
}

function calculate_loan_linear({loan_term, interest, deduction, loan, tax_scheme, extra_payment_monthly, extra_payment_period, extra_payment_start, extra_payment_value, extra_payment_period1, extra_payment_start1, extra_payment_value1, extra_payment_period2, extra_payment_start2, extra_payment_value2, max_extra_payments_per_year_pct, overpayment_penalty}) {
    const rate = interest / (12 * 100);

    let total_paid_gross = 0;
    let total_paid_extra = 0;
    let total_tax_returned = 0;
    let total_penalty = 0;
    let debt = loan;
    let max_extra_payments_per_year = (max_extra_payments_per_year_pct/100) * loan;
    let actual_extra_payments_per_year = 0;
    let penalty = 0;

    let capital_payment_m = debt / loan_term;

    let monthly = [];
    for(let i=0; i<loan_term; i++) {
      if (i%12==0)
        actual_extra_payments_per_year = 0;

      let capital_payment = capital_payment_m; // debt / (loan_term - i);
      const interest_amt = debt * rate;
      let base_payment = capital_payment + interest_amt;
      if (capital_payment > debt) {
        capital_payment = debt;
        base_payment = interest_amt + debt;
      };

      let tax_return = 0;
      let extra_payment = extra_payment_monthly;
      if (tax_scheme==1) {
        tax_return = (interest_amt) * (deduction  / 100.0);
      } else if (tax_scheme==2) {
        extra_payment += (interest_amt) * (deduction  / 100.0);
      };
      extra_payment_start -= 1;
      if (extra_payment_start==0) {
        extra_payment_start = extra_payment_period;
        extra_payment += extra_payment_value;
      };
      extra_payment_start1 -= 1;
      if (extra_payment_start1==0) {
        extra_payment_start1 = extra_payment_period1;
        extra_payment += extra_payment_value1;
      };
      extra_payment_start2 -= 1;
      if (extra_payment_start2==0) {
        extra_payment_start2 = extra_payment_period2;
        extra_payment += extra_payment_value2;
      };

      if (base_payment*2 > debt) {
        extra_payment = 0;
      };      
      if (capital_payment + extra_payment > debt) {
        extra_payment = debt - capital_payment;
      };
      actual_extra_payments_per_year += extra_payment;
      if (actual_extra_payments_per_year > max_extra_payments_per_year) {
        penalty = extra_payment * (overpayment_penalty / 100);
        extra_payment -= penalty;
      } else {
        penalty = 0;
      };

      capital_payment += extra_payment;


      let total_payment = base_payment + extra_payment + penalty;
      const net_payment = total_payment - tax_return;

      total_paid_gross += total_payment;
      total_tax_returned += tax_return;
      total_paid_extra += extra_payment;
      total_penalty += penalty;

      monthly.push({
        month: i + 1,
        debt,
        base_payment,
        capital_payment,
        interest_amt,
        extra_payment,
        tax_return,
        net_payment, 
        penalty,
        total_payment,
      });

      debt -= capital_payment;
      if (debt <=0)
        break;

    };

    return {
        monthly,
        total_paid_gross,
        total_paid_extra,
        total_tax_returned,
        total_penalty,
    };
}

function calculate_loan_annuity({loan_term, interest, deduction, loan, tax_scheme, extra_payment_monthly, extra_payment_period, extra_payment_start, extra_payment_value, extra_payment_period1, extra_payment_start1, extra_payment_value1, extra_payment_period2, extra_payment_start2, extra_payment_value2, max_extra_payments_per_year_pct, overpayment_penalty}) {
    const rate = interest / (12 * 100);
  
    let total_paid_gross = 0;
    let total_paid_extra = 0;
    let total_tax_returned = 0;
    let total_penalty = 0;
    let debt = loan;
    let max_extra_payments_per_year = (max_extra_payments_per_year_pct/100) * loan;
    let actual_extra_payments_per_year = 0;
    let penalty = 0;
    
    let base_payment = -PMT(rate, loan_term, debt);

    let monthly = [];
    for(let i=0; i<loan_term; i++) {
      if (i%12==0)
        actual_extra_payments_per_year = 0;

      const interest_amt = -IPMT(debt, base_payment, rate, 1);
      let  capital_payment = base_payment - interest_amt;
      if (capital_payment > debt) {
        capital_payment = debt;
        base_payment = interest_amt + debt;
      };

      let tax_return = 0;
      let extra_payment = extra_payment_monthly;
      if (tax_scheme==1) {
        tax_return = (interest_amt) * (deduction  / 100.0);
      } else if (tax_scheme==2) {
        extra_payment += (interest_amt) * (deduction  / 100.0);
      };
      extra_payment_start -= 1;
      if (extra_payment_start==0) {
        extra_payment_start = extra_payment_period;
        extra_payment += extra_payment_value;
      };
      extra_payment_start1 -= 1;
      if (extra_payment_start1==0) {
        extra_payment_start1 = extra_payment_period1;
        extra_payment += extra_payment_value1;
      };
      extra_payment_start2 -= 1;
      if (extra_payment_start2==0) {
        extra_payment_start2 = extra_payment_period2;
        extra_payment += extra_payment_value2;
      };

      if (base_payment*2 > debt) {
        extra_payment = 0;
      };
      if (capital_payment + extra_payment > debt) {
        extra_payment = debt - capital_payment;
      };
      actual_extra_payments_per_year += extra_payment;
      if (actual_extra_payments_per_year > max_extra_payments_per_year) {
        penalty = extra_payment * (overpayment_penalty / 100);
        extra_payment -= penalty;
      } else {
        penalty = 0;
      };

      capital_payment += extra_payment;

      let total_payment = base_payment + extra_payment + penalty;
      const net_payment = total_payment - tax_return;

      total_paid_gross += total_payment;
      total_paid_extra += extra_payment;
      total_tax_returned += tax_return;
      total_penalty += penalty;

      monthly.push({
        month: i + 1,
        debt,
        base_payment,
        capital_payment,
        interest_amt,
        extra_payment,
        tax_return,
        net_payment,
        penalty,
        total_payment,
      });

      debt -= capital_payment;
      if (debt <= 0)
        break;
    };
  
    return {
        monthly,
        total_paid_gross,
        total_paid_extra,
        total_tax_returned,
        total_penalty,
    };
}

function calculate_loan(loan_params) {
    if (loan_params.loan_type==1) {
        return calculate_loan_annuity(loan_params);
    } else if (loan_params.loan_type==2) {
        return calculate_loan_linear(loan_params);
    } else if (loan_params.loan_type==3) {
        return calculate_loan_interest_only(loan_params);
    } else {
        throw "unknown loan_type value, it must be '1' or '2'";
    };
}
