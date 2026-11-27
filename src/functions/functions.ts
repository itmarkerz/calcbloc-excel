/*
 * CalcBloc custom functions for Excel (namespace CALCBLOC). The JSDoc below is turned into functions.json by
 * custom-functions-metadata-plugin at build time, and the same plugin registers each function with Excel.
 * The logic lives in ../lib/core.ts so it can be unit-tested without Excel.
 */
/* global CustomFunctions */
import * as core from "../lib/core";
import { CalcBlocError } from "../lib/errors";
import { getDeps } from "../runtime";

function toExcelError(e: unknown): Error | CustomFunctions.Error {
  const message = (e instanceof Error ? e.message : String(e)).slice(0, 255);
  if (typeof CustomFunctions === "undefined") return e instanceof Error ? e : new Error(message);
  const code = e instanceof CalcBlocError && e.kind === "invalid" ? CustomFunctions.ErrorCode.invalidValue : CustomFunctions.ErrorCode.notAvailable;
  return new CustomFunctions.Error(code, message);
}

async function wrap<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toExcelError(e);
  }
}

/**
 * Estimated annual take-home pay (net salary) after income tax and employee contributions, from CalcBloc's calculator for the country.
 * @customfunction NET
 * @helpurl https://github.com/itmarkerz/calcbloc-excel#calcblocnet
 * @param country Country code or name, e.g. "uk", "us", "germany". Empty uses the default country set in the task pane.
 * @param gross Annual gross salary in the country's currency (India: annual CTC).
 * @param [region] Region where the country needs one, e.g. US state "ca", Canadian province "on", "scotland".
 * @param [year] Tax year, e.g. 2026 or "2026-27". Calculations use the current tax year.
 * @returns Annual take-home pay.
 */
async function net(country: string, gross: number, region?: string, year?: any): Promise<number> {
  return wrap(() => core.net(getDeps(), country, gross, region, year));
}

/**
 * Annual income tax. Uses CalcBloc's calculator where there is one; for countries with tax tables only, applies the official income-tax brackets to the amount as taxable income.
 * @customfunction TAX
 * @helpurl https://github.com/itmarkerz/calcbloc-excel#calcbloctax
 * @param country Country code or name, e.g. "uk", "poland". Empty uses the default country.
 * @param gross Annual gross salary (calculator countries) or annual taxable income (bracket estimate).
 * @param [region] Region where the calculation needs one, e.g. "ca" or "on". Leave empty for a bracket estimate.
 * @param [year] Tax year, e.g. 2026 or "2026-27".
 * @param [section] Name of a bands section to apply instead of the calculator, e.g. "federal-income-tax-mfj".
 * @returns Annual income tax.
 */
async function tax(country: string, gross: number, region?: string, year?: any, section?: string): Promise<number> {
  return wrap(() => core.tax(getDeps(), country, gross, region, year, section));
}

/**
 * One rate, threshold or amount from the official tax tables. Rates are decimals (0.2 = 20%).
 * @customfunction RATE
 * @helpurl https://github.com/itmarkerz/calcbloc-excel#calcblocrate
 * @param country Country code or name, e.g. "ireland".
 * @param section Section id or title from the tax tables, e.g. "income-tax-rates" or "usc".
 * @param label Row label (or a unique part of it), or the row number in the section (1, 2, 3...).
 * @param [year] Tax year, e.g. 2026 or "2025-26". Empty: the current year.
 * @param [region] Region for regional tables, e.g. "scotland", "ca", "on".
 * @returns The rate (decimal), amount or text.
 */
async function rate(country: string, section: string, label: any, year?: any, region?: string): Promise<any> {
  return wrap(() => core.rate(getDeps(), country, section, label, year, region));
}

/**
 * Estimated total annual cost of employing someone: salary plus employer social security, payroll taxes and other on-costs.
 * @customfunction EMPLOYER_COST
 * @helpurl https://github.com/itmarkerz/calcbloc-excel#calcblocemployer_cost
 * @param country Country code or name, e.g. "uk", "germany". Empty uses the default country.
 * @param gross Annual gross salary in the country's currency (India: annual CTC).
 * @param [region] Region where the country needs one, e.g. US state "ny", Australian state "nsw".
 * @param [year] Tax year, e.g. 2026 or "2026-27". Calculations use the current tax year.
 * @returns Annual cost to the employer.
 */
async function employerCost(country: string, gross: number, region?: string, year?: any): Promise<number> {
  return wrap(() => core.employerCost(getDeps(), country, gross, region, year));
}

/**
 * Tax withheld on a bonus, commission, RSU vest, option exercise or lump sum paid on top of a salary, with the country's official withholding method.
 * @customfunction BONUS_WITHHOLDING
 * @helpurl https://github.com/itmarkerz/calcbloc-excel#calcblocbonus_withholding
 * @param country Country code or name, e.g. "us", "uk", "ca". Empty uses the default country.
 * @param salary Regular gross annual salary in the country's currency.
 * @param amount The bonus or other payment (gross).
 * @param [type] "bonus" (default), "commission", "rsu_vest", "option_exercise" or "lump_sum".
 * @param [region] State or province where needed (US, Canada), e.g. "ca" or "on".
 * @param [result] "totalWithheld" (default), "totalLiability", "difference" or "netPayment".
 * @returns The tax withheld on the payment.
 */
async function bonusWithholding(country: string, salary: number, amount: number, type?: string, region?: string, result?: string): Promise<number> {
  return wrap(() => core.bonusWithholding(getDeps(), country, salary, amount, type, region, result));
}

/**
 * Duties and taxes on one import into the UK, an EU member state, the US or India, from the official tariff. An estimate, not a customs ruling; an incomplete total is an error.
 * @customfunction IMPORT_DUTY
 * @helpurl https://github.com/itmarkerz/calcbloc-excel#calcblocimport_duty
 * @param destination Importing country, e.g. "gb", "de", "us" or "in".
 * @param origin Country of origin, e.g. "cn" or "in".
 * @param code Commodity code, 10 digits (8 for India), e.g. "0901210000".
 * @param customsValue Customs value in the tariff's currency.
 * @param [result] "duties_and_taxes" (default), "customs_duty", "extra_duties", "excise", "import_vat" or "landed_cost".
 * @param [proofOfOrigin] TRUE when the goods have a valid proof of origin for a preference.
 * @returns The amount in the tariff's currency.
 */
async function importDuty(destination: string, origin: string, code: string, customsValue: number, result?: string, proofOfOrigin?: boolean): Promise<number> {
  return wrap(() => core.importDuty(getDeps(), destination, origin, code, customsValue, result, proofOfOrigin));
}
