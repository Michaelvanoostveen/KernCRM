import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { euroTekst } from "../offerte/bereken";
import { INSTELLINGEN_KERNKOZIJNEN as inst } from "../offerte/instellingen";
import { pdfTekst } from "../offerte/pdf/tekst";
import { BEDRIJF_FACTUUR, bedrijfsgegevensCompleet } from "./bedrijf";

Font.registerHyphenationCallback((woord) => [woord]);

// Huisstijl KernKozijnen: groen en terracotta op zand.
const GROEN = "#24332B";
const TERRA = "#B35B40";
const LIJN = "#DFD8CB";
const INK = "#23272A";
const GRIJS = "#656D76";

const s = StyleSheet.create({
  pagina: { fontFamily: "Helvetica", fontSize: 10, color: INK, paddingBottom: 70 },
  tekst: { lineHeight: 1.4 },
  kop: { backgroundColor: GROEN, color: "#FFFFFF", paddingVertical: 22, paddingHorizontal: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  kopNaam: { fontSize: 19, fontFamily: "Helvetica-Bold", lineHeight: 1.15 },
  kopPayoff: { fontSize: 9, marginTop: 5, color: "#C3D0C6" },
  inhoud: { paddingHorizontal: 36, paddingTop: 24 },
  waarschuwing: { backgroundColor: "#FBE9E4", borderWidth: 1, borderColor: TERRA, borderRadius: 4, padding: 8, marginBottom: 14, fontSize: 9, color: "#8A3A24" },
  titel: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  klein: { fontSize: 9, color: GRIJS },
  vet: { fontFamily: "Helvetica-Bold" },
  rij: { flexDirection: "row", justifyContent: "space-between" },
  blokken: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  meta: { width: 200 },
  metaRij: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  toelichting: { marginTop: 18, lineHeight: 1.5 },
  tabelKop: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 4, marginTop: 20, fontFamily: "Helvetica-Bold", fontSize: 9, color: GRIJS },
  regel: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: LIJN, paddingVertical: 7 },
  totalen: { marginTop: 14, alignSelf: "flex-end", width: 250 },
  totaalRij: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totaalGroot: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: INK, marginTop: 5, paddingTop: 6, fontSize: 13, fontFamily: "Helvetica-Bold" },
  betalen: { marginTop: 24, borderWidth: 1.5, borderColor: TERRA, borderRadius: 6, padding: 14 },
  betalenTitel: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  voet: { position: "absolute", bottom: 22, left: 36, right: 36, borderTopWidth: 1, borderTopColor: LIJN, paddingTop: 7, flexDirection: "row", justifyContent: "space-between" },
  voetTekst: { fontSize: 8, color: GRIJS },
});

export interface FactuurGegevens {
  nummer: string;
  factuurdatum: string;
  vervaldatum: string;
  omschrijving: string;
  toelichting: string | null;
  bedragExcl: number;
  btwHoog: number;
  btwLaag: number;
  totaal: number;
  meerwerk: number;
  status: "open" | "betaald" | "geannuleerd" | "gecrediteerd";
  /** Standaard een factuur; bij een creditnota staan de bedragen als aftrek en ontbreken vervaldatum en betaalgegevens. */
  soort?: "factuur" | "creditnota";
  /** Bij een creditnota: het nummer van de factuur waar hij bij hoort. */
  verwijstNaar?: string;
  projectNummer: string;
  projectNaam: string;
  klantNaam: string;
  /** Aanhef aan het begin van de brief, bijvoorbeeld "Beste heer Jansen,". */
  begroeting: string;
  adresRegels: string[];
}

const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(`${iso}T12:00:00Z`));
const eur = (n: number) => pdfTekst(euroTekst(n, 2));

export function FactuurDocument({ f }: { f: FactuurGegevens }) {
  const b = BEDRIJF_FACTUUR;
  const compleet = bedrijfsgegevensCompleet();
  const hoogDeel = Math.round(inst.deelHoog * 100);
  const credit = f.soort === "creditnota";
  const eurTeken = (n: number) => (credit ? `-${eur(n)}` : eur(n));
  return (
    <Document title={`${credit ? "Creditnota" : "Factuur"} ${f.nummer}`} author={b.naam}>
      <Page size="A4" style={s.pagina}>
        <View style={s.kop}>
          <View>
            <Text style={s.kopNaam}>{pdfTekst(b.naam)}</Text>
            <Text style={s.kopPayoff}>Kwaliteit in kunststof. Vertrouwd thuis.</Text>
          </View>
          <Text style={{ fontSize: 9, color: "#C3D0C6" }}>{pdfTekst(`${b.plaats} - ${b.telefoon}\n${b.email}`)}</Text>
        </View>

        <View style={s.inhoud}>
          {!compleet && <Text style={s.waarschuwing}>Let op: IBAN, KvK-nummer en btw-nummer zijn nog niet ingevuld. Verstuur dit document pas als die gegevens kloppen.</Text>}
          {f.status === "geannuleerd" && <Text style={s.waarschuwing}>Deze factuur is geannuleerd en vervangen.</Text>}
          <Text style={s.titel}>{credit ? "Creditnota" : "Factuur"}</Text>

          <View style={s.blokken}>
            <View>
              <Text style={s.vet}>{pdfTekst(f.klantNaam)}</Text>
              {f.adresRegels.map((r, i) => <Text key={i}>{pdfTekst(r)}</Text>)}
            </View>
            <View style={s.meta}>
              <View style={s.metaRij}><Text style={s.klein}>{credit ? "Creditnotanummer" : "Factuurnummer"}</Text><Text style={s.vet}>{pdfTekst(f.nummer)}</Text></View>
              <View style={s.metaRij}><Text style={s.klein}>{credit ? "Datum" : "Factuurdatum"}</Text><Text>{datum(f.factuurdatum)}</Text></View>
              {credit
                ? <View style={s.metaRij}><Text style={s.klein}>Betreft factuur</Text><Text style={s.vet}>{pdfTekst(f.verwijstNaar ?? "")}</Text></View>
                : <View style={s.metaRij}><Text style={s.klein}>Te betalen voor</Text><Text style={s.vet}>{datum(f.vervaldatum)}</Text></View>}
              <View style={s.metaRij}><Text style={s.klein}>Project</Text><Text>{pdfTekst(f.projectNummer)}</Text></View>
            </View>
          </View>

          <Text style={[s.tekst, { marginTop: 18 }]}>{pdfTekst(f.begroeting)}</Text>
          {f.toelichting && <Text style={s.toelichting}>{pdfTekst(f.toelichting)}</Text>}

          <View style={s.tabelKop}><Text>Omschrijving</Text><Text>Bedrag excl. btw</Text></View>
          <View style={s.regel}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.vet}>{pdfTekst(f.omschrijving)}</Text>
              <Text style={s.klein}>{pdfTekst(f.projectNaam)}</Text>
              {f.meerwerk !== 0 && <Text style={s.klein}>{pdfTekst(`Hierin verwerkt: meer- en minderwerk ${f.meerwerk > 0 ? "+" : "-"}${eur(Math.abs(f.meerwerk))} incl. btw`)}</Text>}
            </View>
            <Text style={s.vet}>{eurTeken(f.bedragExcl)}</Text>
          </View>

          <View style={s.totalen}>
            <View style={s.totaalRij}><Text>Totaal excl. btw</Text><Text>{eurTeken(f.bedragExcl)}</Text></View>
            <View style={s.totaalRij}><Text>{pdfTekst(`Btw ${Math.round(inst.btwHoog * 100)}% over ${hoogDeel}%`)}</Text><Text>{eurTeken(f.btwHoog)}</Text></View>
            <View style={s.totaalRij}><Text>{pdfTekst(`Btw ${Math.round(inst.btwLaag * 100)}% over ${100 - hoogDeel}%`)}</Text><Text>{eurTeken(f.btwLaag)}</Text></View>
            <View style={s.totaalGroot}><Text>Totaal incl. btw</Text><Text>{eurTeken(f.totaal)}</Text></View>
          </View>

          {!credit && (<View style={s.betalen} wrap={false}>
            <Text style={s.betalenTitel}>Betalen</Text>
            <Text style={s.tekst}>{pdfTekst(`Wilt u het bedrag van ${euroTekst(f.totaal, 2)} overmaken voor ${datum(f.vervaldatum)}?`)}</Text>
            <View style={[s.metaRij, { marginTop: 6 }]}><Text style={s.klein}>IBAN</Text><Text style={s.vet}>{pdfTekst(b.iban)}</Text></View>
            <View style={s.metaRij}><Text style={s.klein}>Ten name van</Text><Text>{pdfTekst(b.naam)}</Text></View>
            <View style={s.metaRij}><Text style={s.klein}>Onder vermelding van</Text><Text style={s.vet}>{pdfTekst(`factuurnummer ${f.nummer}`)}</Text></View>
          </View>)}
          {credit && <Text style={[s.tekst, { marginTop: 18 }]}>Dit bedrag wordt in mindering gebracht op de genoemde factuur. Heeft u al meer betaald dan er na deze creditnota nog verschuldigd is, dan nemen wij contact met u op over de terugbetaling.</Text>}
          <Text style={[s.tekst, { marginTop: 14 }]}>Heeft u een vraag over dit document? Neem gerust contact met ons op, wij helpen u graag.</Text>
        </View>

        <View style={s.voet} fixed>
          <Text style={s.voetTekst}>{pdfTekst(`${b.naam} - ${b.plaats} - KvK ${b.kvk} - btw ${b.btwNummer}`)}</Text>
          <Text style={s.voetTekst} render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} van ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function maakFactuurPdf(f: FactuurGegevens): Promise<Buffer> {
  return renderToBuffer(<FactuurDocument f={f} />);
}

export const creditnotaBestandsnaam = (nummer: string) => `Creditnota-${nummer}.pdf`.replace(/[^A-Za-z0-9._-]/g, "-");
export const factuurBestandsnaam = (nummer: string) => `Factuur-${nummer}.pdf`.replace(/[^A-Za-z0-9._-]/g, "-");
