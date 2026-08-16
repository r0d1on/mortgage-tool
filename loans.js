function date_add_days(date, days) {
    var t = new Date(date.valueOf());
    t.setDate(t.getDate() + days);
    return t;
}

function date_add_months(date, months) {
    var t = new Date(date.valueOf());
    t.setMonth(t.getMonth() + months);
    return t;
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

function minimize(fx, x0) {
  const tol = 0.001;
  let step = x0 / 10;
  let d = 0;
  let dy = 0;

  let fm = fx(x0 - step);
  let f0 = fx(x0);
  let fp = fx(x0 + step);

  while (true) {
    if ((fm > f0)&&(f0 < fp)) {
      step = step / 2;
      dy = f0 - fp;
      fm = fx(x0 - step);
      fp = fx(x0 + step);
    } else if (fm > fp) {
      x0 = x0 + step;
      dy = f0 - fp;
      fm = f0;
      f0 = fp;
      if (d < 0) step = step / 2;
      fp = fx(x0 + step);
      d = 1;
    } else if (fm < fp) {
      x0 = x0 - step;
      dy = f0 - fm;
      fp = f0;
      f0 = fm;
      if (d>0) step = step / 2;
      fm = fx(x0 - step);
      d = -1;
    } else {
      throw "unexpected optimisation outcome";
    };

    if (Math.abs(dy) <= tol)
      break;
  };
  return x0;
};

function daily_ICB(loan, loan_start_date, debt, loan_days, rate, ICB, base_payment0, capital_payment0, interest_amt0, best_approx) {

  if (best_approx === undefined) {
    loan_days = minimize((days) => {
      const z = daily_ICB(loan, loan_start_date, debt, days, rate, ICB, base_payment0, capital_payment0, interest_amt0, false);
      return Math.abs(z.capital_payment - capital_payment0);
    }, loan_days);
    
    rate = minimize((daily_rate) => {
      const z = daily_ICB(loan, loan_start_date, debt, loan_days, daily_rate, ICB, base_payment0, capital_payment0, interest_amt0, false);
      return Math.abs(z.interest_amt - interest_amt0);
    }, rate);
  };

  let t = new Date(loan_start_date);
  if (best_approx == false) t.setDate(1);

  let [base_payment, capital_payment, interest_amt] = [0.0, 0.0, 0.0];
  let j = 0;
  while (t.getMonth() <= loan_start_date.getMonth()) {
    let x = ICB(
      loan,
      loan_days,
      rate,
      debt,
      j
    );
    t = date_add_days(t, 1);
    j++;
    debt -= x.capital_payment;
    base_payment += x.base_payment;
    capital_payment += x.capital_payment;
    interest_amt += x.interest_amt;
  };

  return {base_payment, capital_payment, interest_amt}
}

function calculate_loan_payments(loan_params, ICB) {
  let debt = loan_params.loan;
  let actual_extra_payments = 0;
  let penalty = 0;

  let lp = structuredClone(loan_params);
  lp.max_extra_payment_per_year = lp.loan * (lp.max_extra_payments_per_year_pct / 100);

  let monthly = [];
  
  let loan_start_date = new Date(lp.loan_start);
  let loan_end_date = date_add_months(new Date(loan_start_date), lp.loan_term);

  let t = new Date(loan_start_date);
  let loan_days = 0;
  while (t < loan_end_date) {
    t = date_add_days(t, 1);
    loan_days++;
  };

  let month_date = new Date(loan_start_date);
  month_date.setDate(1);

  if (debt <= 0) {
    const tax = (lp.tax_scheme?lp.purchase_deductible_cost:0) * (lp.tax_rate  / 100.0);
    monthly.push({
      month: 1,
      date: month_date,
      debt: debt*1,
      base_payment: debt*1,
      capital_payment: debt*1,
      interest_amt: 0,
      extra_payment: 0,
      extra_payment2: 0,
      tax_return: tax,
      net_payment: debt - tax,
      penalty: 0,
      total_payment: debt - tax,
    });
    return monthly;    
  }

  for(let i=0; i<loan_params.loan_term; i++) {
    if (month_date.getMonth()==1)
      actual_extra_payments = 0;

    let {base_payment, capital_payment, interest_amt} = ICB(
      lp.loan,
      lp.loan_term,
      lp.interest_rate / (12 * 100),
      debt,
      i
    );

    let partial = (i==0) && (loan_start_date.getDate()>1);
    let extra_payment = (partial)?0:lp.extra_payment_monthly;
    let extra_payment2 = 0;
    let restart = false;
  
    if (partial) {
      ({base_payment, capital_payment, interest_amt} = daily_ICB(
        lp.loan, 
        loan_start_date,
        debt,
        loan_days,
        lp.interest_rate / (365 * 100),
        ICB,
        base_payment, capital_payment, interest_amt
      ));
      capital_payment = 0;
      base_payment = interest_amt;
      restart = true;
    };

    let tax_return = 0;
    if (lp.tax_scheme) {
      tax_return = (interest_amt) * (lp.tax_rate  / 100.0); // intrest tax return
      if (i < 12) {
        // spread deductible purchase costs refund throughout the first year
        tax_return += (lp.purchase_deductible_cost) * (lp.tax_rate  / 100.0) / 12;
      };
    };

    ["", "1", "2"].map((ix)=>{
      lp['extra_payment_start'+ix] -= 1;
      if (lp['extra_payment_start'+ix]==0) {
        lp['extra_payment_start'+ix] = lp['extra_payment_period'+ix];
        extra_payment2 += lp['extra_payment_value'+ix];
      };
    });

    if ((base_payment + extra_payment + extra_payment2 + penalty < lp.extra_payment_topup)&&(!partial)) {
      extra_payment += lp.extra_payment_topup - (base_payment + extra_payment + extra_payment2 + penalty)
    };

    if (capital_payment + extra_payment + extra_payment2 > debt) {
      extra_payment = Math.min(extra_payment, Math.max(0, debt - capital_payment));
      extra_payment2 = Math.max(0, debt - capital_payment - extra_payment);
      capital_payment = debt - extra_payment - extra_payment2;
    };

    if (("xp_" + ( i + 1 )) in OVERRIDES) {
      extra_payment = OVERRIDES["xp_"+(i+1)];
    };

    actual_extra_payments += extra_payment + extra_payment2;
    if (actual_extra_payments > lp.max_extra_payment_per_year) {
      penalty = (actual_extra_payments - lp.max_extra_payment_per_year) * (lp.overpayment_penalty / 100);
      actual_extra_payments -= extra_payment + extra_payment2;
      [extra_payment, extra_payment2] = ((extra_payment + extra_payment2)>0)?[
        extra_payment - penalty * extra_payment / (extra_payment + extra_payment2),
        extra_payment2 - penalty * extra_payment2 / (extra_payment + extra_payment2)
      ]:[0, 0];
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
      date: month_date,
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

    if (extra_payment + extra_payment2 != 0) {
      if ((lp.loan_type == 1)&&(lp.extra_payment_mech == 1)) { // annuity reducing term
          restart = true;
      } else if ((lp.loan_type == 2)&&(lp.extra_payment_mech == 0)) { // linear reducing monthly payment
          restart = true;
      }
    };

    if (restart) {
      lp.loan = debt;
      lp.loan_term = loan_params.loan_term - i - 1;
      lp.max_extra_payment_per_year = lp.loan * (lp.max_extra_payments_per_year_pct / 100);
    };

    month_date = date_add_months(month_date, 1);

    if (debt <= 0)
      break;
  };

  return monthly
}

function calculate_loan(loan_params) {
    let monthly = [];
    if (loan_params.loan_type==1) { // annuity
        monthly = calculate_loan_payments(loan_params, (loan, term, rate, debt, i)=>{
          // let base_payment = -PMT(lp.interest_rate / (12 * 100), lp.loan_term, lp.loan);
          let base_payment = -PMT(rate, term - i, debt);
          let interest_amt = -IPMT(debt, base_payment, rate, 1);
          let capital_payment = base_payment - interest_amt;
          return {base_payment, capital_payment, interest_amt} 
        });

    } else if (loan_params.loan_type==2) { // linear
        monthly = calculate_loan_payments(loan_params, (loan, term, rate, debt, i)=>{
          let capital_payment = loan / term;
          let interest_amt = debt * rate;
          let base_payment = capital_payment + interest_amt;
          if (capital_payment > debt) {
              capital_payment = debt;
              base_payment = interest_amt + debt;
          };
          return {base_payment, capital_payment, interest_amt} 
        });

    } else if (loan_params.loan_type==3) { // interest-only
        loan_params.tax_scheme = 0; // interest-only loans do not create tax returns
        monthly = calculate_loan_payments(loan_params, (loan, term, rate, debt, i)=>{
          let capital_payment = (i==term-1) ? loan : 0;
          let interest_amt = debt * rate;
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
