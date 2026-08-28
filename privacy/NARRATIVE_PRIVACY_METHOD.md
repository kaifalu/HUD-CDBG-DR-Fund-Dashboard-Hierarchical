# Narrative privacy screening

Public narrative excerpts are screened for street-address-like text before deployment. Addresses associated with infrastructure/public-facility or clearly multifamily/rental activities are retained and visually highlighted. Potential addresses associated with buyouts, homeowner assistance, single-family rehabilitation or reconstruction, replacement housing, relocation, or ambiguous residential contexts are replaced with `[REDACTED — POTENTIAL SINGLE-FAMILY ADDRESS]`.

Activity classification is used only to determine how detected address text is handled within narrative excerpts. It does not remove, reclassify, or otherwise alter the financial/activity dataset. Narratives without detected address text remain available.

The automated method is deliberately conservative and should be supplemented with internal review before public release. The restricted QA file contains original detected spans and must not be uploaded to a public GitHub repository.
