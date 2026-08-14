import { afterEach, describe, expect, test } from "bun:test";
import { BodaccClient } from "../src/bodacc";
import { OpenDataError } from "../src/http";
import {
  installMockFetch,
  jsonResponse,
  queryOf,
  type MockedFetch,
} from "./helpers";

let mocked: MockedFetch | null = null;
afterEach(() => {
  mocked?.restore();
  mocked = null;
});

describe("BodaccClient.announcements", () => {
  test("builds the Opendatasoft query for a SIREN", async () => {
    mocked = installMockFetch(() => jsonResponse({ records: [] }));
    await new BodaccClient().announcements({ siren: "552032534" });

    const call = mocked.calls[0]!;
    expect(call.url).toStartWith(
      "https://bodacc-datadila.opendatasoft.com/api/records/1.0/search/",
    );
    const qs = queryOf(call);
    expect(qs.get("dataset")).toBe("annonces-commerciales");
    expect(qs.get("q")).toBe("552032534");
    expect(qs.get("rows")).toBe("20");
    expect(qs.get("sort")).toBe("dateparution");
  });

  test("honors a custom limit", async () => {
    mocked = installMockFetch(() => jsonResponse({ records: [] }));
    await new BodaccClient().announcements({ siren: "552032534", limit: 5 });
    expect(queryOf(mocked.calls[0]!).get("rows")).toBe("5");
  });

  test("maps records to typed announcements", async () => {
    mocked = installMockFetch(() =>
      jsonResponse({
        records: [
          {
            fields: {
              dateparution: "2026-01-15",
              commercant: "EXEMPLE SAS",
              familleavis_lib: "Procédures collectives",
              typeavis_lib: "Avis initial",
              numeroannonce: 1234,
            },
          },
          { fields: { typeavis_lib: "Avis rectificatif" } },
          {},
        ],
      }),
    );
    const result = await new BodaccClient().announcements({
      siren: "552032534",
    });

    expect(result.siren).toBe("552032534");
    expect(result.announcements).toHaveLength(3);

    const [first, second, third] = result.announcements;
    expect(first!.type).toBe("Procédures collectives");
    expect(first!.date).toBe("2026-01-15");
    expect(first!.summary).toBe("Avis initial — EXEMPLE SAS");
    expect(first!.provenance.sourceRecordId).toBe("1234");

    expect(second!.type).toBe("Avis rectificatif");
    expect(second!.summary).toBe("Avis rectificatif");
    expect(second!.provenance.sourceRecordId).toBeNull();

    expect(third!.type).toBe("annonce");
    expect(third!.date).toBeNull();
  });

  test("propagates non-2xx as OpenDataError with the status", async () => {
    mocked = installMockFetch(() => jsonResponse({}, 429));
    const err = await new BodaccClient()
      .announcements({ siren: "552032534" })
      .catch((e) => e);
    expect(err).toBeInstanceOf(OpenDataError);
    expect((err as OpenDataError).status).toBe(429);
  });
});
