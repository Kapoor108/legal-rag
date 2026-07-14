import { LegalDocument, LegalRelationship, DocumentChunk } from "../types";

export const initialDocuments: LegalDocument[] = [
  {
    id: "irc-sec-61",
    title: "Internal Revenue Code Section 61: Gross Income Defined",
    category: "Act",
    citationCode: "26 U.S.C. § 61",
    author: "United States Congress",
    date: "1954-08-16",
    summary: "The foundational statutory provision defining 'gross income' for federal tax purposes as all income from whatever source derived, unless specifically excluded.",
    pages: [
      "Sec. 61. Gross income defined. (a) General definition. Except as otherwise provided in this subtitle, gross income means all income from whatever source derived, including (but not limited to) the following items: (1) Compensation for services, including fees, commissions, fringe benefits, and similar items; (2) Gross income derived from business; (3) Gains derived from dealings in property; (4) Interest; (5) Rents; (6) Royalties; (7) Dividends; (8) Alimony and separate maintenance payments; (9) Annuities; (10) Income from life insurance and endowment contracts; (11) Pensions; (12) Income from discharge of indebtedness; (13) Distributive share of partnership gross income; (14) Income in respect of a decedent; and (15) Distributive share of partnership gross income.",
      "(b) Cross references. For items specifically included in gross income, see part II (sec. 71 and following). For items specifically excluded from gross income, see part III (sec. 101 and following). The term 'gross income' has been interpreted broadly by the courts to encompass any accession to wealth, unless a specific statutory exclusion applies."
    ]
  },
  {
    id: "glenshaw-glass",
    title: "Commissioner of Internal Revenue v. Glenshaw Glass Co.",
    category: "Court Judgment",
    citationCode: "348 U.S. 426",
    author: "Supreme Court of the United States",
    date: "1955-03-28",
    summary: "A landmark US Supreme court case that established the modern broad definition of gross income under Section 61, declaring punitive damages to be taxable as undeniable accessions to wealth.",
    pages: [
      "This litigation involves two distinct cases, which we consolidate for decision. The common issue is whether money received as exemplary damages for fraud or the treble damages portion of an antitrust recovery must be reported by a taxpayer as gross income under Section 22(a) of the Internal Revenue Code of 1939 (the predecessor of Section 61 of the 1954 Code). The taxpayers contend that punitive damages are windfalls and do not constitute income, arguing they represent a penalty imposed on the wrongdoer rather than a gain derived from capital or labor.",
      "We cannot accept the taxpayers' contentions. Congress, in enacting the tax laws, applied no limitations as to the source of taxable receipts, intending to tax all gains except those specifically exempted. Punitive damages are not a gift, nor are they exempt. Here, we have undeniable accessions to wealth, clearly realized, and over which the taxpayers have complete dominion. The mere fact that the payments were extracted from wrongdoers as punishment does not detract from their character as taxable income to the recipients. Therefore, punitive damages constitute gross income."
    ]
  },
  {
    id: "cottage-savings",
    title: "Cottage Savings Association v. Commissioner of Internal Revenue",
    category: "Court Judgment",
    citationCode: "499 U.S. 554",
    author: "Supreme Court of the United States",
    date: "1991-04-17",
    summary: "Supreme Court decision holding that a financial institution realizes a tax loss when it exchanges mortgage participation interests for others that are 'materially different' because they represent distinct legal entitlements.",
    pages: [
      "The issue is whether Cottage Savings Association realized a tax loss when it exchanged a group of mortgage participation interests for a different group of mortgage participation interests. The Commissioner of Internal Revenue contends that no loss was realized because the interests exchanged were 'substantially identical' under regulatory rules, and thus did not constitute a realization event under Section 1001(a) of the Internal Revenue Code.",
      "Under Section 1001(a), a realization event occurs upon the 'sale or other disposition of property.' We hold that an exchange of properties constitutes a 'disposition of property' and a realization event if the properties exchanged are 'materially different.' Properties are materially different so long as their respective possessors enjoy legal entitlements that are different in kind or extent. Because the participation interests exchanged here had different obligors and were secured by different homes, they embodied distinct legal entitlements. Thus, Cottage Savings realized a deductible loss."
    ]
  },
  {
    id: "rev-rul-2023-14",
    title: "IRS Revenue Ruling 2023-14: Cryptocurrency Staking Rewards",
    category: "Tax Document",
    citationCode: "Rev. Rul. 2023-14",
    author: "Internal Revenue Service",
    date: "2023-07-31",
    summary: "An official IRS guidance ruling that a cash-method taxpayer must include the fair market value of cryptocurrency validation/staking rewards in gross income in the taxable year they gain dominion and control.",
    pages: [
      "ISSUE: Does a taxpayer using the cash receipts and disbursements method of accounting realize gross income under Section 61 of the Internal Revenue Code upon receipt of additional cryptocurrency tokens as rewards for validation or staking services? FACTS: Taxpayer A participates in a proof-of-stake blockchain protocol. A stakes tokens and successfully validates a block of transactions, receiving 100 new tokens as a staking reward. A has the immediate ability to sell, trade, or transfer these tokens.",
      "HOLDING: Yes. Under Section 61(a), gross income includes all accessions to wealth, clearly realized, and over which the taxpayer has complete dominion, as established in Commissioner v. Glenshaw Glass Co. (348 U.S. 426). When Taxpayer A receives staking rewards, A obtains an accession to wealth with immediate dominion and control. Therefore, the fair market value of the staking reward tokens, determined at the date and time of receipt, must be included in gross income for that taxable year."
    ]
  },
  {
    id: "realization-commentary",
    title: "Understanding Realization and the Legacy of Glenshaw Glass",
    category: "POV/Commentary",
    citationCode: "POV Legal Commentary 2024-03",
    author: "Prof. Evelyn Vance, NYU Law",
    date: "2024-03-12",
    summary: "An analytical legal commentary tracing the doctrinal evolution of 'realization' in tax law, comparing the absolute accession theory of Glenshaw Glass with the material difference threshold in Cottage Savings.",
    pages: [
      "The definition of 'gross income' under 26 U.S.C. § 61 is deceptively simple, yet its boundaries have been carved by decades of jurisprudential combat. When the Supreme Court in Eisner v. Macomber (252 U.S. 189) famously defined income as 'gain derived from capital, from labor, or from both combined,' it created a restrictive framework. The turning point came with Commissioner v. Glenshaw Glass Co. (348 U.S. 426), where Chief Justice Warren sweepingly redefined income as any 'undeniable accession to wealth, clearly realized, and over which the taxpayers have complete dominion.' This effectively decoupled income from physical or intellectual labor, paving the way for taxation of windfalls, damages, and eventually digital assets.",
      "The second pillar of the gross income doctrine is 'realization' under Section 1001. In Cottage Savings Ass'n v. Commissioner (499 U.S. 554), the Court addressed what triggers a realization event during property exchanges. By adopting the 'material difference' standard, the Court established that even highly similar financial instruments trigger a taxable event if they carry different legal rights (e.g., distinct obligors or collateral). This low threshold has profound modern implications. For instance, when the IRS issued Revenue Ruling 2023-14 regarding cryptocurrency staking, it heavily relied on Glenshaw Glass to argue that staking rewards are immediate accessions, while ignoring potential arguments that creation of tokens is not a realization event."
    ]
  }
];

export const initialRelationships: LegalRelationship[] = [
  {
    sourceId: "glenshaw-glass",
    targetId: "irc-sec-61",
    type: "interprets",
    description: "Glenshaw Glass interprets 'gross income' under IRC Section 61 as extending to all undeniable accessions to wealth."
  },
  {
    sourceId: "cottage-savings",
    targetId: "irc-sec-61",
    type: "interprets",
    description: "Cottage Savings defines the statutory threshold of 'realization' required for a taxable disposition under IRC Section 1001/61."
  },
  {
    sourceId: "rev-rul-2023-14",
    targetId: "irc-sec-61",
    type: "interprets",
    description: "Revenue Ruling 2023-14 applies Section 61(a) to include cryptocurrency staking rewards in gross income."
  },
  {
    sourceId: "rev-rul-2023-14",
    targetId: "glenshaw-glass",
    type: "cites",
    description: "Revenue Ruling 2023-14 cites the Glenshaw Glass three-part test (accession, realization, dominion) as the basis for taxing staking rewards."
  },
  {
    sourceId: "realization-commentary",
    targetId: "irc-sec-61",
    type: "discusses",
    description: "The commentary analyzes how the definition of gross income in Section 61 has evolved from Eisner v. Macomber to today."
  },
  {
    sourceId: "realization-commentary",
    targetId: "glenshaw-glass",
    type: "discusses",
    description: "The commentary evaluates the legacy and impact of the Glenshaw Glass decision on modern tax jurisprudence."
  },
  {
    sourceId: "realization-commentary",
    targetId: "cottage-savings",
    type: "discusses",
    description: "The commentary contrasts Cottage Savings' material difference rule with Eisner v. Macomber's restrictive realization rules."
  },
  {
    sourceId: "realization-commentary",
    targetId: "rev-rul-2023-14",
    type: "discusses",
    description: "The commentary criticizes Revenue Ruling 2023-14's reliance on Glenshaw Glass and its interpretation of token creation."
  }
];

// Helper to chunk a document into page-indexed DocumentChunks
export function chunkDocument(doc: LegalDocument): DocumentChunk[] {
  return doc.pages.map((pageText, idx) => ({
    id: `${doc.id}-p${idx + 1}`,
    docId: doc.id,
    docTitle: doc.title,
    docCategory: doc.category,
    citationCode: doc.citationCode,
    pageIndex: idx + 1,
    text: pageText
  }));
}
