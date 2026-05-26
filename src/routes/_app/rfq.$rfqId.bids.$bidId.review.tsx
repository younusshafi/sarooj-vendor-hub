import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/integrations/supabase-external/auth";
import { toast } from "sonner";

export const Route = createFileRoute(
  "/_app/rfq/$rfqId/bids/$bidId/review"
)({
  component: BidReviewPage,
});

const CURRENCY_OPTIONS = ["OMR", "USD", "AED", "SAR"];
const VAT_OPTIONS = ["inclusive", "exclusive", "not_stated"];
const PAYMENT_OPTIONS = [
  "advance_full",
  "advance_partial",
  "on_delivery",
  "credit_days",
  "pdc",
  "tbd",
];
const PAYMENT_METHOD_OPTIONS = [
  "bank_transfer",
  "cheque",
  "pdc",
  "cash",
  "tbd",
];

function confidenceStyle(confidence: string | null) {
  if (confidence === "high") return "border-green-400 bg-green-50";
  if (confidence === "medium") return "border-amber-400 bg-amber-50";
  return "border-red-400 bg-red-50";
}

function BidReviewPage() {
  const { rfqId, bidId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable bid fields
  const [fields, setFields] = useState({
    quotation_reference: "",
    quotation_date: "",
    currency: "OMR",
    vat_treatment: "not_stated",
    payment_structure: "tbd",
    credit_days: "",
    pdc_days: "",
    advance_percentage: "",
    payment_method: "tbd",
    delivery_lead_time_days: "",
    validity_days: "",
    manufacturer_brand: "",
    general_notes: "",
  });

  const [editedItems, setEditedItems] = useState<
    {
      bid_item_id: string;
      rfq_item_id: string;
      description: string;
      quantity: number;
      unit: string;
      rate: number | "";
      ai_confidence: string | null;
    }[]
  >([]);

  const { data: bid, isLoading: bidLoading } = useQuery({
    queryKey: ["bid-review", bidId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bids")
        .select("*, vendors(company_name, email)")
        .eq("bid_id", bidId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: bidItems, isLoading: itemsLoading } = useQuery({
    queryKey: ["bid-items-review", bidId],
    queryFn: async () => {
      const { data } = await supabase
        .from("bid_items")
        .select(
          "*, rfq_items(item_number, sap_item_number, sap_material_code, description, quantity, unit)"
        )
        .eq("bid_id", bidId);
      return (data ?? []) as any[];
    },
  });

  // Populate editable fields when bid loads
  useEffect(() => {
    if (bid) {
      setFields({
        quotation_reference: bid.quotation_reference ?? "",
        quotation_date: bid.quotation_date ?? "",
        currency: bid.currency ?? "OMR",
        vat_treatment: bid.vat_treatment ?? "not_stated",
        payment_structure: bid.payment_structure ?? "tbd",
        credit_days: bid.credit_days ?? "",
        pdc_days: bid.pdc_days ?? "",
        advance_percentage: bid.advance_percentage ?? "",
        payment_method: bid.payment_method ?? "tbd",
        delivery_lead_time_days: bid.delivery_lead_time_days ?? "",
        validity_days: bid.validity_days ?? "",
        manufacturer_brand: bid.manufacturer_brand ?? "",
        general_notes: bid.general_notes ?? "",
      });
    }
  }, [bid]);

  useEffect(() => {
    if (bidItems) {
      setEditedItems(
        bidItems.map((bi: any) => ({
          bid_item_id: bi.bid_item_id,
          rfq_item_id: bi.rfq_item_id,
          description: bi.rfq_items?.description || bi.description || "",
          quantity: bi.rfq_items?.quantity ?? 1,
          unit: bi.rfq_items?.unit || bi.unit || "",
          rate: bi.unit_price_omr ?? "",
          ai_confidence: bi.ai_confidence ?? null,
        }))
      );
    }
  }, [bidItems]);

  // Calculate totals
  const subtotal = editedItems.reduce((sum, item) => {
    const rate = typeof item.rate === "number" ? item.rate : 0;
    return sum + rate * item.quantity;
  }, 0);
  const vat =
    fields.vat_treatment === "exclusive" ? subtotal * 0.05 : 0;
  const total = subtotal + vat;

  const updateField = (key: string, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  const updateItemRate = (idx: number, value: string) => {
    const num = value === "" ? "" : parseFloat(value) || 0;
    setEditedItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, rate: num } : item))
    );
  };

  const saveBid = async (newStatus?: string) => {
    setSaving(true);
    try {
      const updateData: any = {
        ...fields,
        credit_days: fields.credit_days ? parseInt(String(fields.credit_days)) : null,
        pdc_days: fields.pdc_days ? parseInt(String(fields.pdc_days)) : null,
        advance_percentage: fields.advance_percentage
          ? parseFloat(String(fields.advance_percentage))
          : null,
        delivery_lead_time_days: fields.delivery_lead_time_days
          ? parseInt(String(fields.delivery_lead_time_days))
          : null,
        validity_days: fields.validity_days
          ? parseInt(String(fields.validity_days))
          : null,
        subtotal_ex_vat_omr: subtotal,
        vat_amount_omr: vat,
        total_inc_vat_omr: total,
        entered_by: user?.email ?? "",
      };
      if (newStatus) updateData.status = newStatus;

      const { error } = await supabase
        .from("bids")
        .update(updateData)
        .eq("bid_id", bidId);
      if (error) throw error;

      // Update bid items
      for (const item of editedItems) {
        const rate = typeof item.rate === "number" ? item.rate : 0;
        await supabase
          .from("bid_items")
          .update({
            unit_price_omr: rate,
            total_price_omr: rate * item.quantity,
          })
          .eq("bid_item_id", item.bid_item_id);
      }
    } catch (err: any) {
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    try {
      await saveBid("confirmed");
      toast.success("Bid confirmed");
      navigate({ to: "/rfq/$rfqId/comparison", params: { rfqId } });
    } catch (err: any) {
      toast.error(err.message || "Failed to confirm bid");
    }
  };

  const handleSaveDraft = async () => {
    try {
      await saveBid();
      toast.success("Saved as draft");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  };

  const handleReject = async () => {
    try {
      await saveBid("rejected");
      toast.success("Bid rejected");
      navigate({ to: "/rfq/$rfqId/", params: { rfqId } });
    } catch (err: any) {
      toast.error(err.message || "Failed to reject bid");
    }
  };

  if (bidLoading || itemsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!bid) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        Bid not found.{" "}
        <Link to="/rfq/$rfqId/" params={{ rfqId }} className="underline" style={{ color: "var(--accent)" }}>
          Back
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl p-5" style={{ backgroundColor: "#FDF3E0" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1
              className="font-display text-[24px]"
              style={{ color: "#7A5200" }}
            >
              Bid Review
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: "#7A5200", opacity: 0.7 }}>
              {bid.vendors?.company_name} — {bid.original_email_id ? `Email ID: ${bid.original_email_id}` : ""}
            </p>
          </div>
          <Link
            to="/rfq/$rfqId/"
            params={{ rfqId }}
            className="text-sm font-medium"
            style={{ color: "var(--accent)" }}
          >
            ← Back to RFQ
          </Link>
        </div>
      </div>

      {/* Confidence legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card px-4 py-2 text-xs">
        <span className="font-semibold text-muted-foreground">Confidence:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border-2 border-green-400 bg-green-50" />
          High — AI certain
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border-2 border-amber-400 bg-amber-50" />
          Medium — please verify
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded border-2 border-red-400 bg-red-50" />
          Not extracted — enter manually
        </span>
      </div>

      {/* Two panel layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* LEFT — Original email */}
        <div
          className="rounded-xl border-l-4 bg-white p-5"
          style={{ borderLeftColor: "var(--border)" }}
        >
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Original Email
          </h2>
          {bid.original_email_id && (
            <div className="mb-3 space-y-1 text-xs text-muted-foreground">
              <div>
                <span className="font-medium">Email ID:</span>{" "}
                {bid.original_email_id}
              </div>
            </div>
          )}
          <div className="max-h-[600px] overflow-y-auto rounded-md border border-border p-3 text-sm">
            {bid.original_email_body ? (
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: bid.original_email_body }}
              />
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                No original email body stored
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — AI Extracted Data */}
        <div
          className="rounded-xl p-5 space-y-5"
          style={{ backgroundColor: "#FDF3E0" }}
        >
          <h2
            className="text-sm font-semibold uppercase tracking-wider"
            style={{ color: "#7A5200" }}
          >
            AI Extracted Data
          </h2>

          {/* Vendor */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Vendor</label>
            <div className="text-sm font-semibold">
              {bid.vendors?.company_name || "—"}
            </div>
          </div>

          {/* Fields grid */}
          <div className="grid grid-cols-2 gap-3">
            <FormField
              label="Quote Reference"
              value={fields.quotation_reference}
              onChange={(v) => updateField("quotation_reference", v)}
            />
            <FormField
              label="Quote Date"
              type="date"
              value={fields.quotation_date}
              onChange={(v) => updateField("quotation_date", v)}
            />
            <FormSelect
              label="Currency"
              value={fields.currency}
              onChange={(v) => updateField("currency", v)}
              options={CURRENCY_OPTIONS}
            />
            <FormSelect
              label="VAT Treatment"
              value={fields.vat_treatment}
              onChange={(v) => updateField("vat_treatment", v)}
              options={VAT_OPTIONS}
            />
            <FormSelect
              label="Payment Structure"
              value={fields.payment_structure}
              onChange={(v) => updateField("payment_structure", v)}
              options={PAYMENT_OPTIONS}
            />
            <FormSelect
              label="Payment Method"
              value={fields.payment_method}
              onChange={(v) => updateField("payment_method", v)}
              options={PAYMENT_METHOD_OPTIONS}
            />
            {(fields.payment_structure === "credit_days" ||
              fields.payment_structure === "pdc") && (
              <FormField
                label={
                  fields.payment_structure === "pdc"
                    ? "PDC Days"
                    : "Credit Days"
                }
                type="number"
                value={
                  fields.payment_structure === "pdc"
                    ? String(fields.pdc_days)
                    : String(fields.credit_days)
                }
                onChange={(v) =>
                  updateField(
                    fields.payment_structure === "pdc"
                      ? "pdc_days"
                      : "credit_days",
                    v
                  )
                }
              />
            )}
            {fields.payment_structure === "advance_partial" && (
              <FormField
                label="Advance %"
                type="number"
                value={String(fields.advance_percentage)}
                onChange={(v) => updateField("advance_percentage", v)}
              />
            )}
            <FormField
              label="Lead Time (days)"
              type="number"
              value={String(fields.delivery_lead_time_days)}
              onChange={(v) => updateField("delivery_lead_time_days", v)}
            />
            <FormField
              label="Validity (days)"
              type="number"
              value={String(fields.validity_days)}
              onChange={(v) => updateField("validity_days", v)}
            />
            <FormField
              label="Manufacturer / Brand"
              value={fields.manufacturer_brand}
              onChange={(v) => updateField("manufacturer_brand", v)}
            />
          </div>

          {/* Items table */}
          <div>
            <div
              className="mb-2 text-xs font-semibold uppercase tracking-wider"
              style={{ color: "#7A5200" }}
            >
              Bid Items
            </div>
            <div className="overflow-x-auto rounded-lg border border-amber-200">
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: "#FDE68A" }}>
                  <tr
                    className="text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "#7A5200" }}
                  >
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2 text-right">Unit Rate (OMR)</th>
                    <th className="px-3 py-2 text-right">Line Total (OMR)</th>
                  </tr>
                </thead>
                <tbody>
                  {editedItems.map((item, idx) => {
                    const rate =
                      typeof item.rate === "number" ? item.rate : 0;
                    const lineTotal = rate * item.quantity;
                    return (
                      <tr key={item.bid_item_id} className="border-t border-amber-100">
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 text-xs max-w-[180px]">
                          {item.description}
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-2 text-xs">{item.unit}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            step="0.001"
                            value={item.rate === "" ? "" : item.rate}
                            onChange={(e) =>
                              updateItemRate(idx, e.target.value)
                            }
                            className={`w-24 rounded border-2 px-2 py-1 text-right text-xs outline-none ${confidenceStyle(
                              item.ai_confidence
                            )}`}
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-mono">
                          {rate > 0
                            ? lineTotal.toLocaleString("en", {
                                minimumFractionDigits: 3,
                              })
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {editedItems.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-4 text-center text-xs text-muted-foreground"
                      >
                        No items extracted
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-3 space-y-1 text-right text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sub Total (ex-VAT)</span>
                <span className="font-mono">
                  OMR{" "}
                  {subtotal.toLocaleString("en", {
                    minimumFractionDigits: 3,
                  })}
                </span>
              </div>
              {fields.vat_treatment === "exclusive" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT (5%)</span>
                  <span className="font-mono">
                    OMR{" "}
                    {vat.toLocaleString("en", { minimumFractionDigits: 3 })}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-amber-200 pt-1 font-semibold">
                <span style={{ color: "#7A5200" }}>Total (inc-VAT)</span>
                <span className="font-mono" style={{ color: "#7A5200" }}>
                  OMR{" "}
                  {total.toLocaleString("en", { minimumFractionDigits: 3 })}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              General Notes / Qualifications
            </label>
            <textarea
              value={fields.general_notes}
              onChange={(e) => updateField("general_notes", e.target.value)}
              rows={3}
              className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-sm outline-none"
            />
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleConfirm}
              disabled={saving}
              className="flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: "#0D7A5A" }}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              CONFIRM BID
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="rounded-md border border-border py-2.5 text-sm font-medium disabled:opacity-50"
            >
              SAVE DRAFT
            </button>
            <button
              onClick={() => setShowRejectConfirm(true)}
              disabled={saving}
              className="rounded-md py-2.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#DC2626" }}
            >
              REJECT BID
            </button>
          </div>
        </div>
      </div>

      {/* Reject confirm modal */}
      {showRejectConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3
              className="font-display text-xl"
              style={{ color: "#DC2626" }}
            >
              Reject Bid
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              This bid will be marked as rejected and excluded from the
              comparison. Continue?
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setShowRejectConfirm(false)}
                className="flex-1 rounded-md border border-border py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="flex-1 rounded-md py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: "#DC2626" }}
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-amber-200 bg-white px-2 py-1.5 text-sm outline-none"
      />
    </div>
  );
}

function FormSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-amber-200 bg-white px-2 py-1.5 text-sm outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}
