/* ============================================================
   Walker's Law Library — content data
   ------------------------------------------------------------
   Add a brief by dropping a line into the chapter's `cases` array:

     { name: 'Lucy v. Zehmer', cite: '196 Va. 493 (1954)', file: 'briefs/contracts/01-lucy-v-zehmer.pdf' }

   `file` is optional — leave it off (or null) and the entry shows as
   "pending" until the PDF is uploaded. PDFs live in lawlibrary/briefs/<class>/.
   Order inside `chapters` is the order shown on the page.
   ============================================================ */

window.LAW_LIBRARY = [
  {
    id: 'contracts',
    name: 'Contracts',
    blurb: 'Formation, enforcement, performance and remedies — the backbone of private ordering.',
    chapters: [
      { title: 'Mutual Assent', cases: [] },
      { title: 'Consideration', cases: [] },
      { title: 'Policing the Bargain', cases: [] },
      { title: 'Statute of Frauds', cases: [] },
      { title: 'Third Parties & Assignment', cases: [] },
      { title: 'Conditions & Performance', cases: [] },
      { title: 'Breach & Repudiation', cases: [] },
      { title: 'Remedies', cases: [] }
    ]
  },
  {
    id: 'property',
    name: 'Property',
    blurb: 'Acquisition, estates, tenancies, transfers and the limits of land use.',
    chapters: [
      { title: 'First Possession', cases: [] },
      { title: 'Ownership & Finders', cases: [] },
      { title: 'Estates & Future Interests', cases: [] },
      { title: 'Landlord & Tenant', cases: [] },
      { title: 'Transfers of Land', cases: [] },
      { title: 'Concurrent Ownership', cases: [] },
      { title: 'Easements & Covenants', cases: [] },
      { title: 'Nuisance & Land Use', cases: [] },
      { title: 'Takings', cases: [] }
    ]
  },
  {
    id: 'torts',
    name: 'Torts',
    blurb: 'Intentional wrongs, the negligence formula, strict liability and dignitary harms.',
    chapters: [
      { title: 'Intentional Torts', cases: [] },
      { title: 'Privileges & Defenses', cases: [] },
      { title: 'Negligence — Duty', cases: [] },
      { title: 'Negligence — Breach', cases: [] },
      { title: 'Cause in Fact', cases: [] },
      { title: 'Proximate Cause', cases: [] },
      { title: 'Comparative Fault', cases: [] },
      { title: 'Strict Liability', cases: [] },
      { title: 'Products Liability', cases: [] },
      { title: 'Defamation & Privacy', cases: [] }
    ]
  }
];
