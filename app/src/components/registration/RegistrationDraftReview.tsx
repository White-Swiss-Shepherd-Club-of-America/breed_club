/**
 * Review component for LLM-extracted registration document data.
 *
 * Shows suggested dog fields with confidence highlighting, conflict
 * resolution UI when names disagree across documents, and the full
 * list of extracted registrations.
 *
 * On confirm, calls onApply with fully-resolved data the caller can
 * use to pre-fill the DogCreatePage form.
 */

import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Edit3,
  Info,
} from "lucide-react";
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
  microchip_number: string | null;
  sire_name: string | null;
  sire_registration_number: string | null;
  dam_name: string | null;
  dam_registration_number: string | null;
  owner_name: string | null;
  breeder_name: string | null;
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
  /** Called when user confirms and wants to proceed to manual form with pre-fill. */
  onApply: (data: ResolvedRegistrationData) => void;
  /** Called when user wants to start over with a different set of documents. */
  onRescan: () => void;
  /** Called when user wants to skip to manual form with no pre-fill. */
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
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <CheckCircle className="w-3 h-3" /> {pct}%
      </span>
    );
  if (conf >= 0.7)
    return (
      <span className="flex items-center gap-1 text-xs text-amber-600">
        <AlertTriangle className="w-3 h-3" /> {pct}%
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-red-600">
      <AlertCircle className="w-3 h-3" /> {pct}%
    </span>
  );
}

function FlagPill({
  flag,
}: {
  flag: { severity: string; message: string };
}) {
  const colors =
    flag.severity === "error"
      ? "bg-red-50 border-red-200 text-red-700"
      : flag.severity === "warning"
        ? "bg-amber-50 border-amber-200 text-amber-700"
        : "bg-gray-50 border-gray-200 text-gray-600";
  const Icon =
    flag.severity === "error"
      ? AlertCircle
      : flag.severity === "warning"
        ? AlertTriangle
        : Info;
  return (
    <div
      className={`flex items-start gap-1.5 px-2.5 py-1.5 rounded-md border text-xs ${colors}`}
    >
      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>{flag.message}</span>
    </div>
  );
}

function RegistryBadge({ abbrev, country }: { abbrev: string; country: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
      {abbrev}
      {country && country !== "XX" && (
        <span className="text-gray-400">{country}</span>
      )}
    </span>
  );
}

// ─── Name conflict resolution ─────────────────────────────────────────────

interface NameConflictResolverProps {
  conflict: RegistrationExtractionResponse["conflicts"][0];
  documents: RegDocExtraction[];
  selected: string;
  onChange: (name: string) => void;
}

function NameConflictResolver({
  conflict,
  documents,
  selected,
  onChange,
}: NameConflictResolverProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");

  return (
    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800">
            Different registries use different names
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            Choose which name should be the official registered name for this club's records.
            Each document's registration number will be preserved regardless.
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
                !customMode && selected === v.value
                  ? "bg-white border-gray-800"
                  : "bg-white/60 border-gray-200 hover:border-gray-400"
              }`}
            >
              <input
                type="radio"
                name="name-choice"
                value={v.value}
                checked={!customMode && selected === v.value}
                onChange={() => {
                  setCustomMode(false);
                  onChange(v.value);
                }}
                className="shrink-0"
              />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-sm text-gray-900 block truncate">
                  {v.value}
                </span>
                {doc && (
                  <span className="text-xs text-gray-500">
                    from{" "}
                    <RegistryBadge
                      abbrev={doc.registry_abbreviation}
                      country={doc.registry_country}
                    />
                    {" "}— {doc.document_type === "export_pedigree" ? "export pedigree" : "registration certificate"}
                  </span>
                )}
              </div>
            </label>
          );
        })}

        {/* Custom name option */}
        <label
          className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
            customMode
              ? "bg-white border-gray-800"
              : "bg-white/60 border-gray-200 hover:border-gray-400"
          }`}
        >
          <input
            type="radio"
            name="name-choice"
            checked={customMode}
            onChange={() => setCustomMode(true)}
            className="shrink-0 mt-1"
          />
          <div className="flex-1 space-y-2">
            <span className="text-sm text-gray-700 font-medium flex items-center gap-1">
              <Edit3 className="w-3.5 h-3.5" /> Use a different name
            </span>
            {customMode && (
              <input
                type="text"
                value={customValue}
                onChange={(e) => {
                  setCustomValue(e.target.value);
                  onChange(e.target.value);
                }}
                placeholder="Enter the official registered name..."
                className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-700 focus:border-transparent"
                autoFocus
              />
            )}
          </div>
        </label>
      </div>
    </div>
  );
}

// ─── Document summary accordion ───────────────────────────────────────────

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
          <RegistryBadge
            abbrev={doc.registry_abbreviation}
            country={doc.registry_country}
          />
          <span className="font-medium text-gray-800 truncate">
            {doc.registered_name || "Unnamed"}
          </span>
          <span className="text-gray-400 shrink-0">#{doc.registration_number}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {errorCount > 0 && (
            <span className="text-xs text-red-600 flex items-center gap-0.5">
              <AlertCircle className="w-3 h-3" /> {errorCount}
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-xs text-amber-600 flex items-center gap-0.5">
              <AlertTriangle className="w-3 h-3" /> {warnCount}
            </span>
          )}
          <ConfidenceBadge conf={doc.overall_confidence} />
          {open ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-3 py-2 space-y-2 border-t border-gray-200 text-xs text-gray-600">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {doc.breed && (
              <>
                <span className="text-gray-400">Breed</span>
                <span>{doc.breed}</span>
              </>
            )}
            {doc.date_of_birth && (
              <>
                <span className="text-gray-400">DOB</span>
                <span>{doc.date_of_birth}</span>
              </>
            )}
            {doc.sex && (
              <>
                <span className="text-gray-400">Sex</span>
                <span className="capitalize">{doc.sex}</span>
              </>
            )}
            {doc.microchip_number && (
              <>
                <span className="text-gray-400">Microchip</span>
                <span>{doc.microchip_number}</span>
              </>
            )}
            {doc.document_type && (
              <>
                <span className="text-gray-400">Document</span>
                <span className="capitalize">{doc.document_type.replace("_", " ")}</span>
              </>
            )}
          </div>
          {allFlags.length > 0 && (
            <div className="space-y-1 pt-1">
              {allFlags.map((f, fi) => (
                <FlagPill key={fi} flag={f} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export function RegistrationDraftReview({
  extraction,
  onApply,
  onRescan,
  onSkip,
}: RegistrationDraftReviewProps) {
  const { suggested, conflicts, registrations, documents } = extraction;

  // Find the name conflict (if any)
  const nameConflict = conflicts.find((c) => c.field === "registered_name");
  const otherConflicts = conflicts.filter((c) => c.field !== "registered_name");

  // Editable suggested fields
  const [name, setName] = useState(suggested.registered_name);
  const [dob, setDob] = useState(suggested.date_of_birth ?? "");
  const [sex, setSex] = useState<"male" | "female" | "">(suggested.sex ?? "");
  const [color, setColor] = useState(suggested.color ?? "");
  const [microchip, setMicrochip] = useState(suggested.microchip_number ?? "");
  const [sireName, setSireName] = useState(suggested.sire_name ?? "");
  const [damName, setDamName] = useState(suggested.dam_name ?? "");
  const [ownerName, setOwnerName] = useState(suggested.owner_name ?? "");
  const [breederName, setBreederName] = useState(suggested.breeder_name ?? "");

  // All-flags for cross-doc issues
  const crossFlags = documents.flatMap((d) =>
    (d.flags || []).filter((f) =>
      ["dob_mismatch", "sex_mismatch", "chip_mismatch", "name_differs"].includes(f.code)
    )
  );
  const dedupedCrossFlags = crossFlags.filter(
    (f, i, arr) => arr.findIndex((ff) => ff.code === f.code) === i
  );

  // Best confidence map from any doc (for field highlighting)
  const fieldConfidences: Record<string, number> = {};
  for (const doc of documents) {
    for (const [k, v] of Object.entries(doc.field_confidences || {})) {
      if (fieldConfidences[k] === undefined || v > fieldConfidences[k]) {
        fieldConfidences[k] = v;
      }
    }
  }

  const handleApply = () => {
    if (!name.trim()) {
      alert("Please enter or confirm the registered name.");
      return;
    }

    // Only include registrations that have an organization_id (matched to DB)
    const resolvedRegs = registrations
      .filter((r): r is MergedRegistration & { organization_id: string } =>
        r.organization_id != null
      )
      .map((r) => ({
        organization_id: r.organization_id,
        registration_number: r.registration_number,
        certificate_url: extraction.certificate_urls[r.document_index],
      }));

    onApply({
      registered_name: name.trim(),
      date_of_birth: dob || null,
      sex: (sex as "male" | "female") || null,
      color: color || null,
      microchip_number: microchip || null,
      sire_name: sireName || null,
      sire_registration_number: suggested.sire_registration_number ?? null,
      dam_name: damName || null,
      dam_registration_number: suggested.dam_registration_number ?? null,
      owner_name: ownerName || null,
      breeder_name: breederName || null,
      registrations: resolvedRegs,
      pedigree: suggested.pedigree ?? null,
      certificate_urls: extraction.certificate_urls,
    });
  };

  return (
    <div className="space-y-6">

      {/* Cross-doc flags (DOB mismatch, etc.) */}
      {dedupedCrossFlags.length > 0 && (
        <div className="space-y-1">
          {dedupedCrossFlags.map((f, i) => (
            <FlagPill key={i} flag={f} />
          ))}
        </div>
      )}

      {/* Name conflict resolution */}
      {nameConflict ? (
        <NameConflictResolver
          conflict={nameConflict}
          documents={documents}
          selected={name}
          onChange={setName}
        />
      ) : (
        /* Single name — show as editable field */
        <div className={confidenceRing(fieldConfidences.registered_name)}>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Registered Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm"
          />
          {fieldConfidences.registered_name !== undefined && (
            <div className="mt-1">
              <ConfidenceBadge conf={fieldConfidences.registered_name} />
            </div>
          )}
        </div>
      )}

      {/* Other conflicts (DOB, sex, microchip) */}
      {otherConflicts.map((conflict) => (
        <div
          key={conflict.field}
          className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800"
        >
          <AlertTriangle className="w-4 h-4 inline mr-1.5 text-amber-600" />
          <strong>{conflict.field}</strong> differs:{" "}
          {conflict.values.map((v) => `${v.registry}: "${v.value}"`).join(", ")}
        </div>
      ))}

      {/* Core identity fields */}
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Owner Name</label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900"
              placeholder="Owner name..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Breeder Name</label>
            <input
              type="text"
              value={breederName}
              onChange={(e) => setBreederName(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gray-900"
              placeholder="Breeder name..."
            />
          </div>
        </div>
      </div>

      {/* Registrations */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">
          Registrations Found ({registrations.length})
        </h3>
        {registrations.length === 0 && (
          <p className="text-xs text-gray-500">No registrations could be matched to known organizations.</p>
        )}
        {registrations.map((reg, i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
          >
            <RegistryBadge
              abbrev={reg.organization_abbreviation}
              country={reg.organization_country}
            />
            <span className="flex-1 font-mono text-gray-800">{reg.registration_number}</span>
            {reg.organization_id ? (
              <span className="text-xs text-green-600 flex items-center gap-0.5">
                <CheckCircle className="w-3 h-3" /> Matched
              </span>
            ) : (
              <span className="text-xs text-amber-600 flex items-center gap-0.5">
                <AlertTriangle className="w-3 h-3" /> New org
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Per-document summaries (collapsed by default) */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">
          Documents ({documents.length})
        </h3>
        {documents.map((doc, i) => (
          <DocumentSummary key={i} doc={doc} />
        ))}
      </div>

      {/* Pedigree info */}
      {suggested.pedigree && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex items-start gap-2">
          <CheckCircle className="w-4 h-4 mt-0.5 text-green-600 shrink-0" />
          <div>
            <span className="font-medium">Pedigree extracted</span> — the form below will be
            pre-filled with ancestors from the export pedigree document.
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 pt-2 border-t border-gray-200">
        <button
          type="button"
          onClick={handleApply}
          className="w-full py-2.5 px-4 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-4 h-4" />
          Use These Details — Continue to Registration Form
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRescan}
            className="flex-1 py-2 px-3 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
          >
            Scan different documents
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="flex-1 py-2 px-3 text-gray-500 text-sm hover:text-gray-700 hover:underline"
          >
            Enter manually instead
          </button>
        </div>
      </div>
    </div>
  );
}
