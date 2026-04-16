/**
 * Prompt builders for registration document classification and extraction.
 *
 * Two stages:
 * 1. Classification — identify the issuing registry and document type
 * 2. Extraction — pull structured fields based on document type
 */

// ─── Classification Prompt ──────────────────────────────────────────────────

export function buildRegClassificationPrompt(
  knownRegistries: { name: string; abbreviation: string; country: string }[]
): string {
  const registryList = knownRegistries
    .map((r) => `- ${r.abbreviation} (${r.name}, ${r.country})`)
    .join("\n");

  return `You are a canine registration document classifier. Given an image of a dog registration certificate or export pedigree, identify the issuing kennel club or federation.

KNOWN REGISTRIES (but the document may be from a registry NOT on this list):
${registryList}

IDENTIFICATION RULES:
- Look for prominent registry branding: logos, headers, watermarks, official stamps.
- "Registration Certificate" or "Permanent Registration Certificate" = document_type "registration"
- "Export Pedigree", "Pedigree de Exportación", "Certificate of Origin", "Certificado Internacional de Pedigree", "Свидетельство о происхождении" = document_type "export_pedigree"
- A plain pedigree without export/registration language = document_type "pedigree"

FCI MEMBER FEDERATIONS — many countries have their own kennel club affiliated with FCI:
- AKC (American Kennel Club) — US, NOT FCI-affiliated
- UKC (United Kennel Club) — US, NOT FCI-affiliated
- CKC (Canadian Kennel Club) — Canada
- KC (The Kennel Club) — UK
- FCI itself does not issue registrations; MEMBER clubs do. Common ones include:
  - KSS (Kinoloski Savez Srbije) — Serbia
  - FCPR (Federación Canófila de Puerto Rico) — Puerto Rico
  - RKF (Russian Kynological Federation) — Russia
  - FCM (Federación Canófila Mexicana) — Mexico
  - FCA (Federación Cinológica Argentina) — Argentina
  - VDH (Verband für das Deutsche Hundewesen) — Germany
  - SCC (Société Centrale Canine) — France
  - SKG (Schweizerische Kynologische Gesellschaft) — Switzerland
  - ENCI (Ente Nazionale della Cinofilia Italiana) — Italy
  - RSCE (Real Sociedad Canina de España) — Spain
  - FKC (Finnish Kennel Club) — Finland
  - NKK (Norsk Kennel Klub) — Norway
  - SKK (Svenska Kennelklubben) — Sweden
  - DKK (Dansk Kennel Klub) — Denmark
- If you see an FCI globe logo AND a national kennel club name, use the NATIONAL club as the registry (not "FCI").

RESPOND with this exact JSON (no markdown fencing):
{
  "registry_name": "<full official name, e.g. 'American Kennel Club'>",
  "registry_abbreviation": "<short code, e.g. 'AKC'>",
  "registry_country": "<ISO 3166-1 alpha-2 country code>",
  "document_type": "registration" | "export_pedigree" | "pedigree",
  "language": "<primary language of the document, e.g. 'English', 'Spanish', 'Russian'>",
  "confidence": <0.0-1.0>,
  "reasoning": "<one sentence>"
}

RULES:
- confidence 0.9+ means you are certain of the registry identification.
- confidence 0.5-0.89 means plausible but uncertain.
- If you cannot identify the registry at all, still return your best guess with low confidence.
- Do NOT extract any dog data in this step — only classify the document.`;
}

// ─── Extraction Prompts ─────────────────────────────────────────────────────

/**
 * Build the extraction prompt for a simple registration certificate
 * (AKC, UKC, FCPR-style — no full pedigree tree).
 */
export function buildRegExtractionPrompt(
  classification: {
    registry_name: string;
    registry_abbreviation: string;
    document_type: string;
    language: string;
  }
): string {
  const preamble = buildRegPreamble(classification);

  if (classification.document_type === "export_pedigree") {
    return preamble + buildExportPedigreeFields();
  }

  return preamble + buildSimpleRegistrationFields();
}

function buildRegPreamble(classification: {
  registry_name: string;
  registry_abbreviation: string;
  document_type: string;
  language: string;
}): string {
  const registryHint = REG_HINTS[classification.registry_abbreviation] || "";

  return `You are extracting structured data from a dog registration document.

CONTEXT:
- Registry: ${classification.registry_name} (${classification.registry_abbreviation})
- Document type: ${classification.document_type}
- Primary language: ${classification.language}
${registryHint ? `\n${registryHint}\n` : ""}
RULES:
- Extract ONLY the fields specified below. Do not invent data.
- Dates MUST be ISO 8601 format (YYYY-MM-DD) regardless of how they appear on the document.
- For "registered_name": extract the dog's name as printed, but STRIP any title prefixes or suffixes.
  Titles include: CH, GRCH, GCH, INT CH, MACH, OTCH, CT, DC, FC, AFC, NFC, NAFC, NOC, BISS, BIS,
  CAMP, WW, VDH, SRB, CHMK, MOR, and similar show/working/championship designations.
  Also strip breed names that appear before the dog's name (e.g., "CAMP. MEX, PANAM. DN0144889" prefix).
  Keep the actual registered name of the dog only.
- For "breed": extract exactly as printed on the certificate. Different registries use different breed names
  for the same breed (e.g., "German Shepherd Dog" vs "White Shepherd" vs "Berger Blanc Suisse" vs
  "Pastor Blanco Suizo" vs "White Swiss Shepherd Dog").
- For "sex": normalize to "male" or "female". Map: "Male"/"Macho"/"Кобель"/"Hane"/"Dog" → "male",
  "Female"/"Hembra"/"Сука"/"Hona"/"Bitch" → "female".
- For "microchip_number": extract the full number, stripping spaces. May be labeled "Microchip",
  "No. DE MICROCHIP", "Чип", "MC", "Chip", "Tatoo/Chip", etc.
- For "registration_number": this is the PRIMARY registration number on this document. It may be
  labeled "No.", "Reg. No.", "Registration Number", "Регистрационный номер", "No. DE REGISTRO",
  "N° REGISTRO F.C.A.", "UKC No.", etc. For FCI export pedigrees, use the number at the top
  of the document (e.g., "JR 72023 Bso", "RKF 6178005", "FCM17207", "FCA 2943").
- For cross_references: if the document mentions registration numbers from OTHER registries
  (e.g., "REV. UKC P748-594" on an FCI doc), capture those.
- For each field, provide a confidence score (0.0-1.0).
- If a field is not visible, set its value to null and confidence to 0.
- Handle rotated/sideways images — AKC certificates are commonly rotated 90°.

`;
}

function buildSimpleRegistrationFields(): string {
  return `EXTRACT these fields from the REGISTRATION CERTIFICATE:

RESPOND with this exact JSON (no markdown fencing):
{
  "registered_name": "<dog's registered name, titles stripped>",
  "registered_name_confidence": <0.0-1.0>,
  "registration_number": "<primary registration number>",
  "registration_number_confidence": <0.0-1.0>,
  "breed": "<breed as printed>",
  "breed_confidence": <0.0-1.0>,
  "sex": "male" | "female" | null,
  "sex_confidence": <0.0-1.0>,
  "date_of_birth": "<YYYY-MM-DD or null>",
  "date_of_birth_confidence": <0.0-1.0>,
  "color": "<color as printed or null>",
  "color_confidence": <0.0-1.0>,
  "microchip_number": "<microchip number or null>",
  "microchip_confidence": <0.0-1.0>,
  "tattoo": "<tattoo ID or null>",
  "dna_number": "<DNA profile number or null>",
  "sire_name": "<sire's registered name, titles stripped, or null>",
  "sire_registration_number": "<sire's reg number or null>",
  "dam_name": "<dam's registered name, titles stripped, or null>",
  "dam_registration_number": "<dam's reg number or null>",
  "owner_name": "<owner name or null>",
  "owner_address": "<owner address or null>",
  "breeder_name": "<breeder name or null>",
  "certificate_date": "<YYYY-MM-DD certificate issue date or null>",
  "cross_references": [
    { "registry": "<abbreviation>", "number": "<reg number>" }
  ]
}`;
}

function buildExportPedigreeFields(): string {
  return `EXTRACT these fields from the EXPORT PEDIGREE document.

This document contains a multi-generation pedigree tree. Extract the dog's identity AND
up to 3 generations of ancestors.

PEDIGREE TREE READING GUIDE:
- The subject dog's parents (generation 1): sire (father) and dam (mother)
- Generation 2: sire's sire, sire's dam, dam's sire, dam's dam
- Generation 3: 8 great-grandparents
- Names in the pedigree often include titles and registration numbers mixed in.
  For each ancestor, extract JUST the registered name (strip titles) and any registration number shown.
- The pedigree tree is usually laid out with the sire's lineage on top and dam's lineage below,
  or left-to-right with the subject on the left.

RESPOND with this exact JSON (no markdown fencing):
{
  "registered_name": "<dog's registered name, titles stripped>",
  "registered_name_confidence": <0.0-1.0>,
  "registration_number": "<primary registration number>",
  "registration_number_confidence": <0.0-1.0>,
  "breed": "<breed as printed>",
  "breed_confidence": <0.0-1.0>,
  "sex": "male" | "female" | null,
  "sex_confidence": <0.0-1.0>,
  "date_of_birth": "<YYYY-MM-DD or null>",
  "date_of_birth_confidence": <0.0-1.0>,
  "color": "<color as printed or null>",
  "color_confidence": <0.0-1.0>,
  "microchip_number": "<microchip number or null>",
  "microchip_confidence": <0.0-1.0>,
  "tattoo": "<tattoo ID or null>",
  "dna_number": "<DNA profile number or null>",
  "sire_name": "<sire's registered name, titles stripped, or null>",
  "sire_registration_number": "<sire's reg number or null>",
  "dam_name": "<dam's registered name, titles stripped, or null>",
  "dam_registration_number": "<dam's reg number or null>",
  "owner_name": "<owner name or null>",
  "owner_address": "<owner address or null>",
  "breeder_name": "<breeder name or null>",
  "certificate_date": "<YYYY-MM-DD certificate/pedigree issue date or null>",
  "cross_references": [
    { "registry": "<abbreviation>", "number": "<reg number>" }
  ],
  "pedigree": {
    "sire": { "registered_name": "<name>", "registration_number": "<num or null>", "titles": "<titles or null>" },
    "dam": { "registered_name": "<name>", "registration_number": "<num or null>", "titles": "<titles or null>" },
    "sire_sire": { "registered_name": "<name>", "registration_number": "<num or null>", "titles": "<titles or null>" },
    "sire_dam": { "registered_name": "<name>", "registration_number": "<num or null>", "titles": "<titles or null>" },
    "dam_sire": { "registered_name": "<name>", "registration_number": "<num or null>", "titles": "<titles or null>" },
    "dam_dam": { "registered_name": "<name>", "registration_number": "<num or null>", "titles": "<titles or null>" },
    "sire_sire_sire": { "registered_name": "<name>", "registration_number": "<num or null>", "titles": "<titles or null>" },
    "sire_sire_dam": { "registered_name": "<name>", "registration_number": "<num or null>", "titles": "<titles or null>" },
    "sire_dam_sire": { "registered_name": "<name>", "registration_number": "<num or null>", "titles": "<titles or null>" },
    "sire_dam_dam": { "registered_name": "<name>", "registration_number": "<num or null>", "titles": "<titles or null>" },
    "dam_sire_sire": { "registered_name": "<name>", "registration_number": "<num or null>", "titles": "<titles or null>" },
    "dam_sire_dam": { "registered_name": "<name>", "registration_number": "<num or null>", "titles": "<titles or null>" },
    "dam_dam_sire": { "registered_name": "<name>", "registration_number": "<num or null>", "titles": "<titles or null>" },
    "dam_dam_dam": { "registered_name": "<name>", "registration_number": "<num or null>", "titles": "<titles or null>" }
  }
}

PEDIGREE EXTRACTION NOTES:
- If an ancestor slot is empty or not shown on the document, set it to null.
- For each ancestor, "titles" should contain any championship/working titles found
  (e.g., "CH", "GRCH", "INT CH VEW'23 CH FIN,DK,NO,HD,B,ED-O").
- "registered_name" should be the CLEAN name without titles.
- "registration_number" is the number shown next to or under the ancestor's name (often a national
  stud book number like "FI 41009/20", "JR 71293 Bso", "P722-245", "RKF 4826404").
- Some pedigrees show health results, coat color, or other annotations alongside names — ignore those
  for the name/number fields.`;
}

// ─── Per-Registry Hints ─────────────────────────────────────────────────────

const REG_HINTS: Record<string, string> = {
  AKC: `REGISTRY-SPECIFIC NOTES (AKC):
- AKC Registration Certificates are often oriented SIDEWAYS (rotated 90° clockwise).
  Read the text accounting for rotation.
- Fields are clearly labeled: NAME, BREED, COLOR, SEX, DATE OF BIRTH, NUMBER, SIRE, DAM, OWNER, BREEDER.
- Registration number format: "DN" followed by 7-8 digits (e.g., "DN22777109").
- AKC DNA # fields may appear — these are NOT the registration number. Capture as dna_number.
- "CERTIFICATE ISSUED" date is the certificate_date.
- Breed is labeled as "GERMAN SHEPHERD DOG" for what other registries call "White Shepherd" or
  "Berger Blanc Suisse" or "White Swiss Shepherd".`,

  UKC: `REGISTRY-SPECIFIC NOTES (UKC):
- UKC Permanent Registration Certificates have a clean, upright layout.
- Fields: "As" (registered name), "UKC No." (registration number), "Breed", "Sex", "Color",
  "The Sire is" / "Sire's UKC No.", "The Dam is" / "Dam's UKC No.", "Birthdate", "Tattoo".
- Registration number format: "P" followed by 3-4 digits, dash, 3 digits (e.g., "P748-594").
- The owner's name and address appear at the bottom.
- The "record as of" date at the bottom is the certificate_date.`,

  KSS: `REGISTRY-SPECIFIC NOTES (KSS — Serbia):
- Kinoloski Savez Srbije, FCI member.
- Documents may be in Serbian (Cyrillic or Latin) with FCI multilingual fields.
- Registration number format: "JR" followed by digits and breed code (e.g., "JR 72023 Bšo").
- "Ime" = Name, "Rasa" = Breed, "Boja" = Color, "Pol" = Sex, "Datum rođenja" = Date of birth.
- "Otac" = Sire, "Majka" = Dam, "Odgajivač" = Breeder, "Vlasnik" = Owner.
- The pedigree tree uses Roman numerals for generations (I, II, III, IV).
- "Tetovir broj" = Tattoo, "Čip" = Microchip.`,

  FCPR: `REGISTRY-SPECIFIC NOTES (FCPR — Puerto Rico):
- Federación Canófila de Puerto Rico, FCI member.
- Documents in Spanish/English.
- Registration number format: "FCPR" followed by letters and digits (e.g., "FCPR HD25.088").
- "Reg. No." = registration number. "MC:" = microchip.
- May include an original FCI registration number from the dog's country of origin.`,

  RKF: `REGISTRY-SPECIFIC NOTES (RKF — Russia):
- Russian Kynological Federation, FCI member.
- Documents are BILINGUAL Russian/English. Extract from English fields when available.
- "Порода / Breed", "Дата рождения / Date of birth", "Пол / Sex", "Кличка собаки / Name of the dog".
- Registration number format: "RKF" followed by digits (e.g., "RKF 6178005").
- "Клеймо / Tattoo", "Чип / Chip" = microchip.
- "Заводчик / Breeder", "Владелец / Owner".
- Pedigree ancestors may have both Russian and English names; prefer English transliteration.`,

  FCM: `REGISTRY-SPECIFIC NOTES (FCM — Mexico):
- Federación Canófila Mexicana, FCI member.
- Documents in Spanish.
- "NOMBRE DEL EJEMPLAR" = Name, "RAZA Ó VARIEDAD" = Breed, "FECHA Y LUGAR DE NACIMIENTO" = DOB/birthplace.
- "No. DE REGISTRO DE F.C.M." = registration number (e.g., "FCM17207").
- "OBSERVACIONES" may contain cross-references to other registries (e.g., "REV. UKC P748-594").
- "CRIADOR" = Breeder, "PROPIETARIO(S)" = Owner.
- The pedigree tree uses "TÍTULOS" (titles), "NOMBRE" (name), "REG. NUM." (registration number).`,

  FCA: `REGISTRY-SPECIFIC NOTES (FCA — Argentina):
- Federación Cinológica Argentina, FCI member (via SICALAM).
- Documents in Spanish.
- "N° REGISTRO F.C.A." = registration number (e.g., "2943").
- "NOMBRE/Name" = registered name, "RAZA/Breed", "FECHA NAC./Date of Birth".
- "SEXO/Sex": "MACHO" = male, "HEMBRA" = female.
- "CRIADOR/Breeder", "PROPIETARIO/Owner".
- "MICROCHIP N°" = microchip number.
- "Padre / Father" = Sire, "Madre / Mother" = Dam.`,

  VDH: `REGISTRY-SPECIFIC NOTES (VDH — Germany):
- Verband für das Deutsche Hundewesen, FCI member.
- Documents typically in German.
- "Zuchtbuchnummer" = stud book/registration number.
- "Wurftag" = whelp date (DOB), "Geschlecht" = sex, "Farbe" = color.
- "Züchter" = breeder, "Eigentümer" = owner.
- "Vater" = sire, "Mutter" = dam.`,

  CKC: `REGISTRY-SPECIFIC NOTES (CKC — Canada):
- Canadian Kennel Club.
- Documents in English/French.
- Registration number format varies.`,

  KC: `REGISTRY-SPECIFIC NOTES (KC — UK):
- The Kennel Club (UK).
- Documents in English.
- Registration number format varies.`,
};
