import { createHandler, apiSuccess } from "@/lib/api-handler";
import { QES_METHOD_LABEL } from "@/lib/qes/pdf-as";
import { pdfAsBase } from "@/lib/qes/config";

export const dynamic = "force-dynamic";

export const GET = createHandler({ action: "brain.read", rateTier: "standard" }, async () => {
  const available = Boolean(pdfAsBase());
  return apiSuccess({
    available,
    methods: available
      ? (Object.entries(QES_METHOD_LABEL) as Array<[string, string]>).map(([id, label]) => ({
          id,
          label,
        }))
      : [],
  });
});
