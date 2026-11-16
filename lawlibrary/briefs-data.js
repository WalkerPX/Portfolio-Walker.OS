/* ============================================================
   Walker's Law Library — content data
   ------------------------------------------------------------
   Structure:  terms → classes → chapters → cases

     terms:    [{ id, name, classes: [...] }]     e.g. 1L Fall
     classes:  { id, name, code, teacher, chapters }
     chapters: { title, pages | tag, cases: [...] }

   Add a brief by dropping a line into the chapter's `cases` array:

     { name: 'Lucy v. Zehmer', cite: '196 Va. 493 (1954)',
       file: 'briefs/contracts/02-lucy-v-zehmer.pdf' }

   `file` is optional — leave it off and the case shows as "pending" until
   the PDF is uploaded to lawlibrary/briefs/<class>/.
   Chapter order is the order taught, per the syllabus / casebook.
   ============================================================ */

window.LAW_LIBRARY = [
  {
    id: '1l-fall',
    name: '1L Fall',
    classes: [
      {
        id: 'contracts',
        name: 'Contracts',
        code: 'Law D511',
        teacher: 'Prof. Lourie',
        chapters: [
          { title: 'Introduction to Contract Law', pages: '1–22', cases: [] },
          { title: 'Mutual Assent', pages: '23–84', cases: [] },
          { title: 'Consideration', pages: '87–131', cases: [] },
          { title: 'UCC Contract Formation', pages: '133–158', cases: [] },
          { title: 'Promissory Estoppel', pages: '213–243', cases: [] },
          { title: 'Option Contracts & Reliance', pages: '253–272', cases: [] },
          { title: 'Restitution', pages: '286–329', cases: [] },
          { title: 'Statute of Frauds', pages: '335–381', cases: [] },
          { title: 'Parol Evidence', pages: '429–475', cases: [] },
          { title: 'Implied Obligation of Good Faith', pages: '485–529', cases: [] },
          { title: 'Capacity: Minority & Mental Incapacity', pages: '575–594', cases: [] },
          { title: 'Duress & Undue Influence', pages: '596–632', cases: [] },
          { title: 'Misrepresentation & Nondisclosure', pages: '632–661', cases: [] },
          { title: 'Unconscionability', pages: '661–702', cases: [] },
          { title: 'Mistake', pages: '743–766', cases: [] },
          { title: 'Changed Circumstances', pages: '768–791', cases: [] },
          { title: 'Express Conditions', pages: '825–849', cases: [] },
          { title: 'Material Breach', pages: '850–870', cases: [] },
          { title: 'Anticipatory Repudiation', pages: '870–888', cases: [] },
          { title: 'Expectation Damages', pages: '893–989', cases: [] },
          { title: 'Reliance & Restitution Damages', pages: '1021–1065', cases: [] },
          { title: 'Specific Performance', pages: '1065–1089', cases: [] },
          { title: 'Liquidated Damages', pages: '1089–1105', cases: [] }
        ]
      },
      {
        id: 'property',
        name: 'Property',
        code: 'Law D509',
        teacher: 'Prof. Mitchell',
        chapters: [
          { title: 'Possession & Ownership', tag: 'Unit 1', cases: [] },
          { title: 'Estates in Land', tag: 'Unit 2', cases: [] },
          { title: 'Co-Tenancies', tag: 'Unit 3', cases: [] },
          { title: 'Landlord–Tenant', tag: 'Unit 4', cases: [] },
          { title: 'Non-Possessory Interests', tag: 'Unit 5', cases: [] },
          { title: 'Land Purchase, Sale & Title', tag: 'Unit 6', cases: [] }
        ]
      },
      {
        id: 'torts',
        name: 'Torts',
        code: 'Law D541',
        chapters: [
          { title: 'Introduction to Tort Liability', cases: [] },
          { title: 'Battery, Assault & False Imprisonment', cases: [] },
          { title: 'IIED, Trespass & Conversion', cases: [] },
          { title: 'Defenses & Privileges', cases: [] },
          { title: 'Negligence: Duty & Standard of Care', cases: [] },
          { title: 'Negligence: Breach, Per Se & Res Ipsa', cases: [] },
          { title: 'Cause in Fact', cases: [] },
          { title: 'Proximate Cause & Foreseeable Harm', cases: [] },
          { title: 'Comparative Fault & Assumption of Risk', cases: [] },
          { title: 'Strict Liability: Abnormally Dangerous Activity', cases: [] },
          { title: 'Products Liability', cases: [] },
          { title: 'Vicarious & Joint and Several Liability', cases: [] },
          { title: 'Workers\u2019 Compensation', cases: [] },
          { title: 'Damages', cases: [] }
        ]
      }
    ]
  }
];
