import { GoldenSetItem } from "../types";

export const goldenSet: GoldenSetItem[] = [
  {
    id: "gs-punitive-damages",
    query: "Does gross income include punitive damages or windfalls?",
    groundTruth: "Yes, under Commissioner v. Glenshaw Glass Co. (348 U.S. 426), gross income includes punitive damages or exemplary damages because they constitute 'undeniable accessions to wealth, clearly realized, and over which the taxpayers have complete dominion.' Punitive damages are not gifts and are not specifically excluded by statute.",
    targetDocId: "glenshaw-glass",
    targetPage: 2
  },
  {
    id: "gs-mortgage-exchange",
    query: "Does exchanging mortgage pools with different obligors trigger a tax realization event?",
    groundTruth: "Yes, under Cottage Savings Association v. Commissioner (499 U.S. 554), an exchange of property constitutes a tax realization event under Section 1001(a) if the properties are 'materially different.' They are materially different if they embody legally distinct entitlements. Because the mortgage pools had different obligors and were secured by different homes, they were materially different, triggering a realized loss.",
    targetDocId: "cottage-savings",
    targetPage: 2
  },
  {
    id: "gs-crypto-staking",
    query: "Are cryptocurrency staking rewards considered taxable gross income?",
    groundTruth: "Yes, under IRS Revenue Ruling 2023-14, a taxpayer who receives cryptocurrency validation or staking rewards must include the fair market value of those tokens in their gross income for the taxable year. This is because receiving the tokens constitutes an accession to wealth over which the taxpayer gains immediate dominion and control (applying the Glenshaw Glass standard).",
    targetDocId: "rev-rul-2023-14",
    targetPage: 2
  },
  {
    id: "gs-three-part-test",
    query: "What is the three-part test established by Glenshaw Glass for gross income?",
    groundTruth: "The three-part test established by the Supreme Court in Commissioner v. Glenshaw Glass Co. defines gross income as consisting of: (1) undeniable accessions to wealth, (2) clearly realized, and (3) over which the taxpayers have complete dominion.",
    targetDocId: "glenshaw-glass",
    targetPage: 2
  },
  {
    id: "gs-irc-sec-61-def",
    query: "What section of the Internal Revenue Code defines gross income and what does it include?",
    groundTruth: "Section 61 of the Internal Revenue Code (26 U.S.C. § 61) defines gross income as 'all income from whatever source derived,' including compensation for services, business income, dealings in property, interest, rents, royalties, dividends, alimony, pensions, and discharge of debt.",
    targetDocId: "irc-sec-61",
    targetPage: 1
  }
];
