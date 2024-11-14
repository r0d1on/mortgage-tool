
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

function calculate_loan_linear(loan_term, interest, deduction, loan, monthly_ownership_tax, purchase_cost, tax_scheme, extra_payment_monthly) {
    const rate = interest / (12 * 100);

    let total_paid_gross = 0;
    let total_paid_extra = 0;
    let total_tax_returned = 0;
    let balance = loan;

    let capital_payment_m = balance / loan_term;

    let monthly = [];
    for(let i=0; i<loan_term; i++) {
      let capital_payment = capital_payment_m; // balance / (loan_term - i);
      const interest_amt = balance * rate;
      const base_payment = capital_payment + interest_amt;

      let tax_return = 0;
      let extra_payment = extra_payment_monthly;
      if (tax_scheme==1) {
        tax_return = (interest_amt) * (deduction  / 100.0);
      } else if (tax_scheme==2) {
        extra_payment += (interest_amt) * (deduction  / 100.0);
      };
      capital_payment += extra_payment;

      const net_payment = base_payment - tax_return;

      let total_payment = base_payment + extra_payment;
      total_paid_gross += total_payment;
      total_tax_returned += tax_return;
      total_paid_extra += extra_payment;

      monthly.push({
        month: i + 1,
        balance,
        base_payment,
        capital_payment,
        interest_amt,
        extra_payment,
        tax_return,
        net_payment, 
        total_payment,
      });

      balance -= capital_payment;
      if (balance <=0)
        break;

    };

    return {
        monthly,
        total_paid_gross,
        total_paid_extra,
        total_tax_returned
    };
}

function calculate_loan_annuity(loan_term, interest, deduction, loan, monthly_ownership_tax, purchase_cost, tax_scheme, extra_payment_monthly) {
    const rate = interest / (12 * 100);
  
    let total_paid_gross = 0;
    let total_paid_extra = 0;
    let total_tax_returned = 0;
    let balance = loan;

    let base_payment = -PMT(rate, loan_term, balance);

    let monthly = [];
    for(let i=0; i<loan_term; i++) {
      const interest_amt = -IPMT(balance, base_payment, rate, 1);
      let  capital_payment = base_payment - interest_amt;

      let tax_return = 0;
      let extra_payment = extra_payment_monthly;
      if (tax_scheme==1) {
        tax_return = (interest_amt) * (deduction  / 100.0);
      } else if (tax_scheme==2) {
        extra_payment += (interest_amt) * (deduction  / 100.0);
      };
      capital_payment += extra_payment;

      const net_payment = base_payment - tax_return;

      let total_payment = base_payment + extra_payment;
      total_paid_gross += total_payment;
      total_paid_extra += extra_payment;
      total_tax_returned += tax_return;

      monthly.push({
        month: i + 1,
        balance,
        base_payment,
        capital_payment,
        interest_amt,
        extra_payment,
        tax_return,
        net_payment, 
        total_payment,
      });

      balance -= capital_payment;
      if (balance <=0)
        break;
    };
  
    return {
        monthly,
        total_paid_gross,
        total_paid_extra,
        total_tax_returned
    };
}

function calculate_loan(loan_type, loan_term, interest, deduction, loan, monthly_ownership_tax, purchase_cost, tax_scheme, extra_payment_monthly) {
    if (loan_type==1) {
        return calculate_loan_annuity(loan_term, interest, deduction, loan, monthly_ownership_tax, purchase_cost, tax_scheme, extra_payment_monthly);
    } else if (loan_type==2) {
        return calculate_loan_linear(loan_term, interest, deduction, loan, monthly_ownership_tax, purchase_cost, tax_scheme, extra_payment_monthly);
    } else {
        throw "unknown loan_type value, it must be '1' or '2'";
    };
}
