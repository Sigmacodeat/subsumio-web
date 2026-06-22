#!/usr/bin/env python3
import os

files = [
    'taxumio.ts', 'compliance.ts', 'consulting.ts',
    'insurance.ts', 'realestate.ts', 'recruiting.ts', 'vc.ts'
]

base = '/Users/msc/subsumio-web/src/content/'

# Unique metaDesc endings per file (EN)
meta_desc_en = {
    'taxumio.ts': 'Deadlines with email digest, client Q&A from your own files, GoBD-stamped invoicing, DATEV export and a Verfahrensdokumentation generator — Taxumio is Subsumio tuned for tax advisors and accountants.',
    'compliance.ts': 'Regulatory obligations with deadline digest, policy Q&A from your own controls, AML/KYC screening, EU AI Act inventory and an exportable audit trail — Compliumio is Subsumio tuned for compliance & GRC teams.',
    'consulting.ts': 'Pitch history, project learnings and client context in one brain that answers \'have we done this before?\' New hires productive in days. Consultumio is Subsumio for consultancies and agencies.',
    'insurance.ts': 'Policy details, claims history, coverage context and renewal prep — one brain that answers "what is this client actually covered for, and what\'s open?" Versumio is Subsumio tuned for insurance brokers & agencies. Self-hosted or EU cloud.',
    'realestate.ts': 'Leases, tenant history, obligations, renewal and notice dates, transactions — one brain that answers "what does this lease say, and what\'s due?" Immumio is Subsumio tuned for property managers and real-estate firms.',
    'recruiting.ts': 'Candidates, who-knows-whom, every interaction in one brain that answers \'who fits this role?\' and keeps the knowledge when a consultant leaves. Talentumio is Subsumio for executive search & recruiting.',
    'vc.ts': 'Founder calls, deal memos, LP updates and intros — one brain that answers \'what\'s open with this founder?\' and \'who invested in X?\' before you walk in. Investumio is Subsumio for VC, PE and angels.',
}

# Unique metaDesc endings per file (DE)
meta_desc_de = {
    'taxumio.ts': 'Fristen mit E-Mail-Digest, Mandanten-Q&A aus den eigenen Akten, GoBD-gestempelte Rechnungen, DATEV-Export und ein Verfahrensdoku-Generator — Taxumio ist Subsumio für Steuerkanzleien.',
    'compliance.ts': 'Regulatorische Pflichten mit Fristen-Digest, Richtlinien-Q&A aus eigenen Kontrollen, AML/KYC-Screening, EU AI Act Inventar und ein exportierbarer Audit-Trail — Compliumio ist Subsumio für Compliance & GRC Teams.',
    'consulting.ts': 'Pitch-Historie, Projekterfahrungen und Mandantenkontext in einem Gehirn, das antwortet "haben wir das schon mal gemacht?" Neue Mitarbeitende produktiv in Tagen. Consultumio ist Subsumio für Beratung & Agenturen.',
    'insurance.ts': 'Polizendetails, Schadenshistorie, Deckungskontext und Erneuerungsvorbereitung — ein Gehirn, das antwortet "was ist dieser Kunde wirklich abgedeckt, und was ist offen?" Versumio ist Subsumio für Versicherungsmakler & Agenturen.',
    'realestate.ts': 'Mietverträge, Mieterhistorie, Pflichten, Erneuerungs- und Kündigungsfristen, Transaktionen — ein Gehirn, das antwortet "was steht im Vertrag, und was fällig?" Immumio ist Subsumio für Hausverwaltung & Immobilien.',
    'recruiting.ts': 'Kandidaten, Wer-kennt-wen, jede Interaktion in einem Gehirn, das antwortet "wer passt auf diese Rolle?" und behält das Wissen, wenn ein Berater geht. Talentumio ist Subsumio für Executive Search & Recruiting.',
    'vc.ts': 'Founder-Calls, Deal-Memos, LP-Updates und Intros — ein Gehirn, das antwortet "was ist offen bei diesem Founder?" und "wer hat in X investiert?" bevor du reingeht. Investumio ist Subsumio für VC, PE und Angels.',
}

# Unique EN badges
badges_en = {
    'taxumio.ts': 'Taxumio — the practice memory for tax & accounting',
    'compliance.ts': 'Compliumio — compliance memory, queryable',
    'consulting.ts': 'Consultumio — the firm\'s institutional memory',
    'insurance.ts': 'Versumio — the broker\'s client memory',
    'realestate.ts': 'Immumio — the property lease memory',
    'recruiting.ts': 'Talentumio — your proprietary talent graph',
    'vc.ts': 'Investumio — the fund\'s deal memory',
}

# Unique DE badges
badges_de = {
    'taxumio.ts': 'Taxumio — das Kanzleigedächtnis für Steuerberater & WP',
    'compliance.ts': 'Compliumio — das Compliance-Gedächtnis, abfragbar',
    'consulting.ts': 'Consultumio — das Institutional Memory der Beratung',
    'insurance.ts': 'Versumio — das Kunden-Gedächtnis des Maklers',
    'realestate.ts': 'Immumio — das Mietvertrags-Gedächtnis der Immobilie',
    'recruiting.ts': 'Talentumio — euer proprietärer Talent-Graph',
    'vc.ts': 'Investumio — das Deal-Gedächtnis des Fonds',
}

for fname in files:
    path = os.path.join(base, fname)
    with open(path, 'r') as f:
        content = f.read()
    
    brand = fname.replace('.ts', '')
    brand_cap = {
        'taxumio': 'Taxumio', 'compliance': 'Compliumio', 'consulting': 'Consultumio',
        'insurance': 'Versumio', 'realestate': 'Immumio', 'recruiting': 'Talentumio', 'vc': 'Investumio'
    }[brand]
    
    # Replace EN metaDesc: find the pattern and replace everything after the brand name + "Subsumio tuned for..."
    # The pattern is: metaDesc:\n      "... Confidentiality-first.",
    # We need to find the exact metaDesc line and replace it
    
    # Simple approach: replace the entire metaDesc block for EN
    old_en_desc = meta_desc_en[fname] + ' Confidentiality-first.'
    new_en_desc = meta_desc_en[fname]
    content = content.replace(old_en_desc, new_en_desc)
    
    # Also handle variations with commas
    old_en_desc2 = meta_desc_en[fname] + ', Confidentiality-first.'
    content = content.replace(old_en_desc2, new_en_desc)
    
    # For consulting: no extra phrase, just "Confidentiality-first." at end
    if 'Confidentiality-first.' in content and fname in meta_desc_en:
        # Replace the exact phrase
        content = content.replace(' Confidentiality-first.', '.')
        content = content.replace(', Confidentiality-first.', '.')
    
    # Replace DE metaDesc: remove "Vertraulichkeit zuerst." or "Verschwiegenheit zuerst."
    content = content.replace(' Vertraulichkeit zuerst.', '.')
    content = content.replace(' Verschwiegenheit zuerst.', '.')
    content = content.replace(', Vertraulichkeit zuerst.', '.')
    content = content.replace(', Verschwiegenheit zuerst.', '.')
    
    # Fix badges: replace both EN and DE occurrences
    old_badge = f'{brand_cap} — powered by Subsumio'
    content = content.replace(f'badge: "{old_badge}"', f'badge: "{badges_en[fname]}"', 1)
    
    # Second occurrence (DE section)
    content = content.replace(f'badge: "{old_badge}"', f'badge: "{badges_de[fname]}"', 1)
    
    # Fix sub phrases: "Self-hosted or EU cloud, confidentiality-first."
    content = content.replace(' Self-hosted or EU cloud, confidentiality-first.', '.')
    content = content.replace(' Self-hosted oder EU-Cloud, Vertraulichkeit zuerst.', '.')
    content = content.replace(' Self-hosted oder EU-Cloud, Verschwiegenheit zuerst.', '.')
    
    with open(path, 'w') as f:
        f.write(content)
    print(f'Fixed {fname}')

print('Done')
