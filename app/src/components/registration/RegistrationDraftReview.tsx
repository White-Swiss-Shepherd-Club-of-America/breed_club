/**
 * Combined review + submission form for LLM-extracted registration data.
 *
 * This is the single confirmation page after scanning. It shows all
 * extracted fields as an editable form — the user verifies, resolves
 * any name conflicts, picks coat type, links owner/breeder to existing
 * contacts via fuzzy search, then submits directly.
 *
 * No second form page is shown after this.
 */

import { useState, useEffect, useRef } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Edit3,
  GitFork,
  Info,
  Loader2,
  Search,
  UserCheck,
  X,
} from "lucide-react";
import { useSearchContacts } from "@/hooks/useContacts";
import type { Contact, ExtractedPedigree, PedigreeAncestor } from "@breed-club/shared";
import type {
  RegistrationExtractionResponse,
  RegDocExtraction,
  MergedRegistration,
} from "@breed-club/shared";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ResolvedRegistrationData {
  registered_name: string;
  date_of_birth: string | null;
  sex: "male" | "female" | null;
  color: string | null;
  coat_type: string | null;
  microchip_number: string | null;
  sire_name: string | null;
  sire_registration_number: string | null;
  dam_name: string | null;
  dam_registration_number: string | null;
  owner_id: string | null;
  breeder_id: string | null;
  registrations: Array<{
    organization_id: string;
    registration_number: string;
    certificate_url?: string;
  }>;
  pedigree: RegistrationExtractionResponse["suggested"]["pedigree"];
  certificate_urls: string[];
}

interface RegistrationDraftReviewProps {
  extraction: RegistrationExtractionResponse;
  breedCoatTypes: string[];
  /** Called when user confirms — submits directly (no second form). */
  onSubmit: (data: ResolvedRegistrationData) => void;
  /** True while the parent is saving. */
  isSubmitting?: boolean;
  /** Called when user wants to scan different documents. */
  onRescan: () => void;
  /** Called when user wants to abandon scan and enter manually. */
  onSkip: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function confidenceRing(conf: number | undefined): string {
  if (conf === undefined || conf === 0) return "ring-2 ring-red-300 rounded-md p-1";
  if (conf < 0.7) return "ring-2 ring-amber-300 rounded-md p-1";
  if (conf < 0.9) return "ring-1 ring-yellow-200 rounded-md p-1";
  return "";
}

function ConfidenceBadge({ conf }: { conf: number }) {
  const pct = Math.round(conf * 100);
  if (conf >= 0.9)
    return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3 h-3" /> {pct}%</span>;
  if (conf >= 0.7)
    return <span className="flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="w-3 h-3" /> {pct}%</span>;
  return <span className="flex items-center gap-1 text-xs text-red-600"><AlertCircle className="w-3 h-3" /> {pct}%</span>;
}

function FlagPill({ flag }: { flag: { severity: string; message: string } }) {
  const colors = flag.severity === "error"
    ? "bg-red-50 border-red-200 text-red-700"
    : flag.severity === "warning"
      ? "bg-amber-50 border-amber-200 text-amber-700"
      : "bg-gray-50 border-gray-200 text-gray-600";
  const Icon = flag.severity === "error" ? AlertCircle : flag.severity === "warning" ? AlertTriangle : Info;
  return (
    <div className={`flex items-start gap-1.5 px-2.5 py-1.5 rounded-md border text-xs ${colors}`}>
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>{flag.message}</span>
    </div>
  );
}

function RegistryBadge({ abbrev, country }: { abbrev: string; country: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
      {abbrev}
      {country && country !== "XX" && <span className="text-gray-400">{country}</span>}
    </span>
  );
}

// ─── Fuzzy contact picker ─────────────────────────────────────────────────────
//
// Pre-seeded with the name extracted from the document. The search fires
// automatically so the user sees candidates without having to type anything.

interface ContactPickerProps {
  label: string;
  extractedName: string | null;
  value: string | null;          // selected contact ID
  onChange: (id: string | null) => void;
}

function ContactPicker({ label, extractedName, value, onChange }: ContactPickerProps) {
  const [query, setQuery] = useState(extractedName ?? "");
  const [open, setOpen] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-search on mount with the extracted name
  const { data, isFetching } = useSearchContacts(query);
  const results: Contact[] = data?.data ?? [];

  // Auto-open when we have a pre-seeded name and results load
  useEffect(() => {
    if (extractedName && results.length > 0 && !value) {
      setOpen(true);
    }
  }, [extractedName, results.length, value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (contact: Contact) => {
    onChange(contact.id);
    setSelectedName(contact.full_name);
    setQuery(contact.full_name);
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setSelectedName(null);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(null);
            setSelectedName(null);
            setOpen(true);
          }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder={`Search for ${label.toLowerCase()}...`}
          className={`w-full px-2 py-1.5 pr-8 border rounded-lg text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent ${
            value ? "border-green-400 bg-green-50" : extractedName && !value ? "border-amber-300" : "border-gray-300"
          }`}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isFetching && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
          {value && !isFetching && <UserCheck className="w-3.5 h-3.5 text-green-600" />}
          {(value || query) && !isFetching && (
            <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600">
              <X className="w-3 h-3" />
            </button>
          )}
          {!value && !isFetching && !query && <Search className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </div>

      {/* Extracted name hint when no match selected yet */}
      {extractedName && !value && selectedName === null && (
        <p className="mt-0.5 text-xs text-amber-700">
          From certificate: <em>{extractedName}</em> — select the matching contact above or leave blank.
        </p>
      )}
      {value && selectedName && (
        <p className="mt-0.5 text-xs text-green-700 flex items-center gap-1">
          <CheckCircle className="w-3 h-3" /> Linked to {selectedName}
        </p>
      )}

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => handleSelect(contact)}
              className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0"
            >
              <div className="font-medium text-gray-900">{contact.full_name}</div>
              {contact.kennel_name && (
                <div className="text-xs text-gray-600">{contact.kennel_name}</div>
              )}
              {contact.email && (
                <div className="text-xs text-gray-400">{contact.email}</div>
              )}
            </button>
          ))}
        </div>
      )}
      {open && !isFetching && query.length >= 2 && results.length === 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow p-2 text-xs text-gray-500">
          No contacts found for "{query}"
        </div>
      )}
    </div>
  );
}

// ─── Extracted pedigree display ───────────────────────────────────────────────

/**
 * Sex of a slot is determined by its index within the generation:
 * even indices are sires (male), odd are dams (female).
 */
function slotSex(index: number): "male" | "female" {
  return index % 2 === 0 ? "male" : "female";
}

function ExtractedPedigreeCell({
  ancestor,
  index,
  gen,
}: {
  ancestor: PedigreeAncestor | null | undefined;
  index: number;
  gen: number;
}) {
  const sex = slotSex(index);
  const bg = sex === "male" ? "bg-blue-50 border-blue-200" : "bg-pink-50 border-pink-200";
  const fontSize =
    gen >= 3 ? "text-[10px] leading-snug" : gen === 2 ? "text-xs" : "text-sm";

  if (!ancestor?.registered_name) {
    return (
      <div className="flex-1 mx-0.5 my-px px-1.5 py-1 border border-dashed border-gray-200 rounded bg-gray-50 text-[10px] text-gray-400 italic flex items-center justify-center">
        Unknown
      </div>
    );
  }

  return (
    <div className={`flex-1 mx-0.5 my-px px-1.5 py-1 border rounded ${bg}`}>
      <div className={`font-semibold text-gray-900 truncate ${fontSize}`} title={ancestor.registered_name}>
        {ancestor.registered_name}
      </div>
      {ancestor.titles && gen < 3 && (
        <div className="text-[9px] text-gray-500 truncate">{ancestor.titles}</div>
      )}
      {ancestor.registration_number && gen < 3 && (
        <div className="text-[9px] text-gray-400 font-mono truncate">{ancestor.registration_number}</div>
      )}
    </div>
  );
}

function ExtractedPedigreeDisplay({ pedigree }: { pedigree: ExtractedPedigree }) {
  const gen1 = [pedigree.sire, pedigree.dam];
  const gen2 = [pedigree.sire_sire, pedigree.sire_dam, pedigree.dam_sire, pedigree.dam_dam];
  const gen3 = [
    pedigree.sire_sire_sire, pedigree.sire_sire_dam,
    pedigree.sire_dam_sire, pedigree.sire_dam_dam,
    pedigree.dam_sire_sire, pedigree.dam_sire_dam,
    pedigree.dam_dam_sire, pedigree.dam_dam_dam,
  ];

  const hasGen3 = gen3.some((a) => a?.registered_name);

  // Fixed column widths matching PedigreeTree style: parents widest, ggp narrowest
  const colWidths = hasGen3 ? [160, 150, 130] : [180, 160];
  const totalWidth = colWidths.reduce((s, w) => s + w + 8, 0);

  const columns = [
    { label: "Parents", entries: gen1 },
    { label: "Grandparents", entries: gen2 },
    ...(hasGen3 ? [{ label: "Great-Grandparents", entries: gen3 }] : []),
  ];

  return (
    <div className="overflow-x-auto">
      <div className="flex items-stretch gap-2" style={{ minWidth: `${totalWidth}px` }}>
        {columns.map(({ label, entries }, colIdx) => (
          <div
            key={label}
            className="flex flex-col flex-shrink-0"
            style={{ width: colWidths[colIdx] }}
          >
            <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wide text-center mb-1">
              {label}
            </div>
            {/* Cells distributed evenly to align with adjacent column */}
            <div className="flex flex-col flex-1 gap-px">
              {entries.map((ancestor, i) => (
                <ExtractedPedigreeCell
                  key={i}
                  ancestor={ancestor}
                  index={i}
                  gen={colIdx + 1}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Name conflict resolution ─────────────────────────────────────────────────

interface NameConflictResolverProps {
  conflict: RegistrationExtractionResponse["conflicts"][0];
  documents: RegDocExtraction[];
  selected: string;
  onChange: (name: string) => void;
}

function NameConflictResolver({ conflict, documents, selected, onChange }: NameConflictResolverProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");

  return (
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800">Different registries use different names</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Choose which should be the official name. All registration numbers will be preserved.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {conflict.values.map((v, i) => {
          const doc = documents[v.source_document];
          return (
            <label
              key={i}
              className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                !customMode && selected === v.value ? "bg-white border-gray-800" : "bg-white/60 border-gray-200 hover:border-gray-400"
              }`}
            >
              <input
                type="radio"
                name="name-choice"
                value={v.value}
                checked={!customMode && selected === v.value}
                onChange={() => { setCustomMode(false); onChange(v.value); }}
                className="shrink-0"
              />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm text-gray-900 block truncate">{v.value}</span>
                {doc && (
                  <span className="text-xs text-gray-500">
                    from <RegistryBadge abbrev={doc.registry_abbreviation} country={doc.registry_country} />
                    {" "}— {doc.document_type === "export_pedigree" ? "export pedigree" : "registration certificate"}
                  </span>
                )}
              </div>
            </label>
          );
        })}
        <label className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${customMode ? "bg-white border-gray-800" : "bg-white/60 border-gray-200 hover:border-gray-400"}`}>
          <input type="radio" name="name-choice" checked={customMode} onChange={() => setCustomMode(true)} className="shrink-0 mt-1" />
          <div className="flex-1 space-y-2">
            <span className="text-sm text-gray-700 font-medium flex items-center gap-1">
              <Edit3 className="w-3.5 h-3.5" /> Use a different name
            </span>
            {customMode && (
              <input
                type="text"
                value={customValue}
                onChange={(e) => { setCustomValue(e.target.value); onChange(e.target.value); }}
                placeholder="Enter the official registered name..."
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-700"
                autoFocus
              />
            )}
          </div>
        </label>
      </div>
    </div>
  );
}

// ─── Document summary accordion ───────────────────────────────────────────────

function DocumentSummary({ doc }: { doc: RegDocExtraction }) {
  const [open, setOpen] = useState(false);
  const allFlags = doc.flags || [];
  const errorCount = allFlags.filter((f) => f.severity === "error").length;
  const warnCount = allFlags.filter((f) => f.severity === "warning").length;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 text-sm"
      >
        <div className="flex items-center gap-2 min-w-0">
          <RegistryBadge abbrev={doc.registry_abbreviation} country={doc.registry_country} />
          <span className="font-medium text-gray-800 truncate">{doc.registered_name || "Unnamed"}</span>
          <span className="text-gray-400 shrink-0">#{doc.registration_number}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {errorCount > 0 && <span className="text-xs text-red-600 flex items-center gap-0.5"><AlertCircle className="w-3 h-3" /> {errorCount}</span>}
          {warnCount > 0 && <span className="text-xs text-amber-600 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> {warnCount}</span>}
          <ConfidenceBadge conf={doc.overall_confidence} />
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {open && (
        <div className="px-3 py-2 space-y-2 border-t border-gray-200 text-xs text-gray-600">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {doc.breed && <><span className="text-gray-400">Breed</span><span>{doc.breed}</span></>}
            {doc.date_of_birth && <><span className="text-gray-400">DOB</span><span>{doc.date_of_birth}</span></>}
            {doc.sex && <><span className="text-gray-400">Sex</span><span className="capitalize">{doc.sex}</span></>}
            {doc.microchip_number && <><span className="text-gray-400">Microchip</span><span>{doc.microchip_number}</span></>}
            {doc.document_type && <><span className="text-gray-400">Document</span><span className="capitalize">{doc.document_type.replace("_", " ")}</span></>}
          </div>
          {allFlags.length > 0 && (
            <div className="space-y-1 pt-1">
              {allFlags.map((f, fi) => <FlagPill key={fi} flag={f} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RegistrationDraftReview({
  extraction,
  breedCoatTypes,
  onSubmit,
  isSubmitting = false,
  onRescan,
  onSkip,
}: RegistrationDraftReviewProps) {
  const { suggested, conflicts, registrations, documents } = extraction;

  const showCoatType = breedCoatTypes.length > 1;

  const nameConflict = conflicts.find((c) => c.field === "registered_name");
  const otherConflicts = conflicts.filter((c) => c.field !== "registered_name");

  // Editable fields
  const [name, setName] = useState(suggested.registered_name);
  const [dob, setDob] = useState(suggested.date_of_birth ?? "");
  const [sex, setSex] = useState<"male" | "female" | "">(suggested.sex ?? "");
  const [color, setColor] = useState(suggested.color ?? "");
  const [coatType, setCoatType] = useState("");
  const [microchip, setMicrochip] = useState(suggested.microchip_number ?? "");
  const [sireName, setSireName] = useState(suggested.sire_name ?? "");
  const [damName, setDamName] = useState(suggested.dam_name ?? "");

  // Owner/breeder: contact IDs resolved via fuzzy picker
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [breederId, setBreederId] = useState<string | null>(null);

  // Cross-doc flags (deduplicated)
  const crossFlags = documents
    .flatMap((d) => (d.flags || []).filter((f) =>
      ["dob_mismatch", "sex_mismatch", "chip_mismatch", "name_differs"].includes(f.code)
    ))
    .filter((f, i, arr) => arr.findIndex((ff) => ff.code === f.code) === i);

  // Best confidence map across all docs
  const fieldConfidences: Record<string, number> = {};
  for (const doc of documents) {
    for (const [k, v] of Object.entries(doc.field_confidences || {})) {
      if (fieldConfidences[k] === undefined || v > fieldConfidences[k]) {
        fieldConfidences[k] = v;
      }
    }
  }

  const handleSubmit = () => {
    if (!name.trim()) {
      alert("Please enter or confirm the registered name.");
      return;
    }
    if (showCoatType && !coatType) {
      alert("Please select the coat type before continuing.");
      return;
    }

    const resolvedRegs = registrations
      .filter((r): r is MergedRegistration & { organization_id: string } => r.organization_id != null)
      .map((r) => ({
        organization_id: r.organization_id,
        registration_number: r.registration_number,
        certificate_url: extraction.certificate_urls[r.document_index],
      }));

    onSubmit({
      registered_name: name.trim(),
      date_of_birth: dob || null,
      sex: (sex as "male" | "female") || null,
      color: color || null,
      coat_type: coatType || null,
      microchip_number: microchip || null,
      sire_name: sireName || null,
      sire_registration_number: suggested.sire_registration_number ?? null,
      dam_name: damName || null,
      dam_registration_number: suggested.dam_registration_number ?? null,
      owner_id: ownerId,
      breeder_id: breederId,
      registrations: resolvedRegs,
      pedigree: suggested.pedigree ?? null,
      certificate_urls: extraction.certificate_urls,
    });
  };

  return (
    <div className="space-y-6">

      {/* Cross-doc flags */}
      {crossFlags.length > 0 && (
        <div className="space-y-1">
          {crossFlags.map((f, i) => <FlagPill key={i} flag={f} />)}
        </div>
      )}

      {/* Registered name (or conflict resolver) */}
      {nameConflict ? (
        <NameConflictResolver conflict={nameConflict} documents={documents} selected={name} onChange={setName} />
      ) : (
        <div className={confidenceRing(fieldConfidences.registered_name)}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Registered Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 text-sm"
          />
          {fieldConfidences.registered_name !== undefined && (
            <div className="mt-1"><ConfidenceBadge conf={fieldConfidences.registered_name} /></div>
          )}
        </div>
      )}

      {/* Other conflicts */}
      {otherConflicts.map((conflict) => (
        <div key={conflict.field} className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 inline mr-1.5 text-amber-600" />
          <strong>{conflict.field}</strong> differs: {conflict.values.map((v) => `${v.registry}: "${v.value}"`).join(", ")}
        </div>
      ))}

      {/* ── Dog details ── */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Dog Details</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className={confidenceRing(fieldConfidences.sex)}>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sex</label>
            <select
              value={sex}
              onChange={(e) => setSex(e.target.value as "male" | "female" | "")}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900"
            >
              <option value="">Unknown</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          <div className={confidenceRing(fieldConfidences.date_of_birth)}>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date of Birth</label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className={confidenceRing(fieldConfidences.color)}>
            <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900"
            />
          </div>

          <div className={confidenceRing(fieldConfidences.microchip)}>
            <label className="block text-xs font-medium text-gray-600 mb-1">Microchip #</label>
            <input
              type="text"
              value={microchip}
              onChange={(e) => setMicrochip(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>

        {/* Coat type — never on papers, always required when club has multiple */}
        {showCoatType && (
          <div className={`rounded-lg p-3 ${!coatType ? "bg-amber-50 border border-amber-300" : "bg-gray-50 border border-gray-200"}`}>
            <label className="block text-xs font-semibold mb-1.5 text-gray-700">
              Coat Type <span className="text-red-500">*</span>
              <span className="ml-1.5 font-normal text-gray-500">— not recorded on registration papers</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {breedCoatTypes.map((ct) => (
                <button
                  key={ct}
                  type="button"
                  onClick={() => setCoatType(ct)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    coatType === ct ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-300 hover:border-gray-600"
                  }`}
                >
                  {ct}
                </button>
              ))}
            </div>
            {!coatType && <p className="mt-1.5 text-xs text-amber-700">Please select before submitting.</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sire (Father)</label>
            <input
              type="text"
              value={sireName}
              onChange={(e) => setSireName(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900"
              placeholder="Sire's registered name..."
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dam (Mother)</label>
            <input
              type="text"
              value={damName}
              onChange={(e) => setDamName(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900"
              placeholder="Dam's registered name..."
            />
          </div>
        </div>
      </div>

      {/* ── Owner & Breeder ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Owner &amp; Breeder</h3>
        <ContactPicker
          label="Owner"
          extractedName={suggested.owner_name ?? null}
          value={ownerId}
          onChange={setOwnerId}
        />
        <ContactPicker
          label="Breeder"
          extractedName={suggested.breeder_name ?? null}
          value={breederId}
          onChange={setBreederId}
        />
      </div>

      {/* ── Registrations ── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">
          Registrations Found ({registrations.length})
        </h3>
        {registrations.length === 0 && (
          <p className="text-xs text-gray-500">No registrations could be matched to known organizations.</p>
        )}
        {registrations.map((reg, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
            <RegistryBadge abbrev={reg.organization_abbreviation} country={reg.organization_country} />
            <span className="flex-1 font-mono text-gray-800">{reg.registration_number}</span>
            {reg.organization_id ? (
              <span className="text-xs text-green-600 flex items-center gap-0.5"><CheckCircle className="w-3 h-3" /> Matched</span>
            ) : (
              <span className="text-xs text-amber-600 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> New org</span>
            )}
          </div>
        ))}
      </div>

      {/* ── Document summaries (collapsed) ── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Documents ({documents.length})</h3>
        {documents.map((doc, i) => <DocumentSummary key={i} doc={doc} />)}
      </div>

      {/* ── Pedigree ── */}
      {suggested.pedigree && Object.values(suggested.pedigree).some((v) => v != null) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <GitFork className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700">Pedigree</h3>
            <span className="text-xs text-gray-400">— extracted from document, review before submitting</span>
          </div>
          <div className="p-3 border border-gray-200 rounded-xl bg-white">
            <ExtractedPedigreeDisplay pedigree={suggested.pedigree} />
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="space-y-2 pt-2 border-t border-gray-200">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full py-2.5 px-4 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
          ) : (
            <><CheckCircle className="w-4 h-4" /> Submit for Approval</>
          )}
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onRescan} className="flex-1 py-2 px-3 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50">
            Scan different documents
          </button>
          <button type="button" onClick={onSkip} className="flex-1 py-2 px-3 text-gray-500 text-sm hover:text-gray-700 hover:underline">
            Enter manually instead
          </button>
        </div>
      </div>
    </div>
  );
}
