import { Document, Font, Image, Page, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";

// Geen afbreken van woorden: dat gaf onregelmatige ruimte tussen woorden.
Font.registerHyphenationCallback((woord) => [woord]);
import { REGELS_KERNKOZIJNEN } from "../../prijs/regels-kernkozijnen";
import { tekenInhoud } from "../../tekening/tekenen";
import { leesConfiguratie, positieOmschrijving } from "../../projecten/positie";
import { euroTekst } from "../bereken";
import { INSTELLINGEN_KERNKOZIJNEN as inst } from "../instellingen";
import { berekenPubliek, vulInvoegvelden, type PubliekeOfferte, type PubliekeRegel } from "../publiek";
import { svgOnderdelen } from "./svg";
import { pdfTekst } from "./tekst";

// Huisstijl KernKozijnen: groen en terracotta op zand.
const GROEN = "#24332B";
const TERRA = "#B35B40";
const ZAND = "#EFEBE3";
const LIJN = "#DFD8CB";
const INK = "#23272A";
const GRIJS = "#656D76";

const s = StyleSheet.create({
  pagina: { fontFamily: "Helvetica", fontSize: 10, color: INK, paddingBottom: 64 },
  tekst: { lineHeight: 1.4 },
  kop: { backgroundColor: GROEN, color: "#FFFFFF", paddingVertical: 22, paddingHorizontal: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  kopNaam: { fontSize: 19, fontFamily: "Helvetica-Bold", lineHeight: 1.15 },
  kopPayoff: { fontSize: 9, marginTop: 5, color: "#C3D0C6" },
  kopRechts: { alignItems: "flex-end" },
  inhoud: { paddingHorizontal: 36, paddingTop: 22 },
  titel: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  meta: { fontSize: 9, color: GRIJS, marginBottom: 14 },
  klant: { marginBottom: 14, fontSize: 10 },
  klein: { fontSize: 9, color: GRIJS },
  koptekst: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  alinea: { marginTop: 8, textAlign: "left" },
  positie: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: LIJN, borderRadius: 5, padding: 8, marginBottom: 7 },
  tekening: { width: 72, height: 72, backgroundColor: ZAND, borderRadius: 4, marginRight: 12, alignItems: "center", justifyContent: "center" },
  positieTekst: { flex: 1, paddingRight: 8 },
  vet: { fontFamily: "Helvetica-Bold" },
  prijs: { fontFamily: "Helvetica-Bold", textAlign: "right" },
  regel: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: LIJN, paddingVertical: 5 },
  totalen: { marginTop: 16, borderWidth: 1, borderColor: LIJN, borderRadius: 5, padding: 12 },
  totaalRij: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  totaalGroot: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LIJN, marginTop: 5, paddingTop: 6, fontSize: 13, fontFamily: "Helvetica-Bold" },
  schema: { marginTop: 10, borderTopWidth: 1, borderTopColor: LIJN, paddingTop: 8 },
  akkoord: { marginTop: 22, borderWidth: 1.5, borderColor: TERRA, borderRadius: 6, padding: 14 },
  akkoordTitel: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  handtekening: { width: 190, height: 52, marginTop: 6, marginBottom: 4 },
  streep: { borderBottomWidth: 1, borderBottomColor: INK, height: 34, marginTop: 4 },
  voet: { position: "absolute", bottom: 22, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: LIJN, paddingTop: 7 },
  voetTekst: { fontSize: 8, color: GRIJS },
});

const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
const eur0 = (n: number) => pdfTekst(euroTekst(n, 0));
const eur = (n: number) => pdfTekst(euroTekst(n, 2));

function tekeningOnderdelen(r: PubliekeRegel) {
  try {
    return svgOnderdelen(tekenInhoud(REGELS_KERNKOZIJNEN, { ...leesConfiguratie(r.positie!.config) }));
  } catch {
    return null;
  }
}

function Tekening({ r }: { r: PubliekeRegel }) {
  const onderdelen = tekeningOnderdelen(r);
  if (!onderdelen) return <Text style={s.klein}>Geen tekening</Text>;
  return (
    <Svg viewBox="0 0 200 200" width={66} height={66}>
      {onderdelen}
    </Svg>
  );
}

function omschrijving(r: PubliekeRegel): string {
  try {
    return positieOmschrijving(REGELS_KERNKOZIJNEN, leesConfiguratie(r.positie!.config));
  } catch {
    return "";
  }
}

/** De offerte als PDF, voor de klant. Bevat alleen eindprijzen en wat de klant ook online ziet. */
export function OfferteDocument({ o }: { o: PubliekeOfferte }) {
  const b = berekenPubliek(o, inst);
  const eigenTotaal = o.eigen_totaal !== null;
  return (
    <Document title={`Offerte ${o.nummer}-v${o.versie}`} author={o.bedrijf} subject={`Offerte voor ${o.project_naam}`}>
      <Page size="A4" style={s.pagina}>
        <View style={s.kop}>
          <View>
            <Text style={s.kopNaam}>{pdfTekst(o.bedrijf)}</Text>
            <Text style={s.kopPayoff}>Kwaliteit in kunststof. Vertrouwd thuis.</Text>
          </View>
          <View style={s.kopRechts}>
            <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold" }}>Offerte {o.nummer}-v{o.versie}</Text>
            {o.verstuurd_op && <Text style={{ fontSize: 9, marginTop: 3 }}>Datum {datum(o.verstuurd_op)}</Text>}
            {o.geldig_tot && <Text style={{ fontSize: 9 }}>Geldig tot {datum(o.geldig_tot)}</Text>}
          </View>
        </View>

        <View style={s.inhoud}>
          <View style={s.klant}>
            <Text style={s.klein}>Offerte voor</Text>
            <Text style={s.vet}>{pdfTekst(o.klant_naam)}</Text>
            {o.adres && (
              <>
                <Text>{pdfTekst(`${o.adres.straat} ${o.adres.huisnummer}${o.adres.toevoeging ? ` ${o.adres.toevoeging}` : ""}`)}</Text>
                <Text>{pdfTekst(`${o.adres.postcode} ${o.adres.plaats}`)}</Text>
              </>
            )}
          </View>
          <Text style={s.titel}>{pdfTekst(`Uw offerte voor ${o.project_naam}`)}</Text>

          {o.regels.map((r, i) => {
            if (r.soort === "kop") return <Text key={i} style={s.koptekst} minPresenceAhead={60}>{pdfTekst(r.titel)}</Text>;
            if (r.soort === "tekst") return (
              <View key={i} wrap={false} style={s.alinea}>
                {r.titel ? <Text style={[s.vet, { fontSize: 12, marginBottom: 3 }]}>{pdfTekst(r.titel)}</Text> : null}
                <Text style={s.tekst}>{pdfTekst(vulInvoegvelden(r.tekst ?? "", o))}</Text>
              </View>
            );
            if (r.soort === "positie") return (
              <View key={i} style={s.positie} wrap={false}>
                <View style={s.tekening}><Tekening r={r} /></View>
                <View style={s.positieTekst}>
                  <Text style={s.vet}>{pdfTekst(`Pos. ${r.positie?.nummer}${r.positie?.ruimte ? ` - ${r.positie.ruimte}` : ""}`)}</Text>
                  <Text style={s.klein}>{pdfTekst(omschrijving(r))}</Text>
                </View>
                <View>
                  <Text style={s.prijs}>{eur0(r.aantal * r.prijs)}</Text>
                  {r.aantal > 1 && <Text style={[s.klein, { textAlign: "right" }]}>{`${r.aantal} x ${eur0(r.prijs)}`}</Text>}
                </View>
              </View>
            );
            if (r.soort === "artikel") return (
              <View key={i} style={s.regel} wrap={false}><Text>{pdfTekst(`${r.aantal} x ${r.titel ?? ""}`)}</Text><Text>{eur0(r.aantal * r.prijs)}</Text></View>
            );
            return (
              <View key={i} style={s.regel} wrap={false}><Text>{pdfTekst(r.titel)}</Text><Text>{`- ${eur0(r.modus === "bedrag" ? Number(r.waarde) : (b.subtotaal * Number(r.waarde)) / 100)}`}</Text></View>
            );
          })}

          <View style={s.totalen} wrap={false}>
            {!eigenTotaal && <View style={s.totaalRij}><Text>Subtotaal</Text><Text>{eur(b.subtotaal)}</Text></View>}
            {!eigenTotaal && b.korting > 0 && <View style={s.totaalRij}><Text>Korting</Text><Text>{`- ${eur(b.korting)}`}</Text></View>}
            <View style={s.totaalRij}><Text>Totaal excl. btw</Text><Text>{eur(b.exclBtw)}</Text></View>
            <View style={s.totaalRij}><Text>{`Btw ${Math.round(inst.btwHoog * 100)}% over ${Math.round(inst.deelHoog * 100)}%`}</Text><Text>{eur(b.btwHoog)}</Text></View>
            <View style={s.totaalRij}><Text>{`Btw ${Math.round(inst.btwLaag * 100)}% over ${Math.round((1 - inst.deelHoog) * 100)}%`}</Text><Text>{eur(b.btwLaag)}</Text></View>
            <View style={s.totaalGroot}><Text>Totaal incl. btw</Text><Text>{eur(b.totaal)}</Text></View>
            <View style={s.schema}>
              <Text style={[s.vet, { marginBottom: 3 }]}>Betaalschema</Text>
              {b.termijnen.map((t) => (
                <View key={t.naam} style={s.totaalRij}><Text>{pdfTekst(`${t.pct}% - ${t.naam}`)}</Text><Text>{eur(t.bedrag)}</Text></View>
              ))}
            </View>
          </View>

          <View style={s.akkoord} wrap={false}>
            {o.akkoord ? (
              <>
                <Text style={s.akkoordTitel}>Akkoord</Text>
                <Text>{pdfTekst(`Getekend door ${o.akkoord.naam} op ${datum(o.akkoord.op)}.`)}</Text>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- het Image-onderdeel van react-pdf kent geen alt */}
                {o.akkoord.handtekening ? <Image src={o.akkoord.handtekening} style={s.handtekening} /> : null}
              </>
            ) : (
              <>
                <Text style={s.akkoordTitel}>Akkoord</Text>
                <Text style={s.tekst}>Ik ga akkoord met deze offerte en de algemene voorwaarden.</Text>
                <View style={{ flexDirection: "row", gap: 24, marginTop: 6 }}>
                  <View style={{ flex: 1 }}><Text style={s.klein}>Naam</Text><View style={s.streep} /></View>
                  <View style={{ flex: 1 }}><Text style={s.klein}>Datum</Text><View style={s.streep} /></View>
                  <View style={{ flex: 2 }}><Text style={s.klein}>Handtekening</Text><View style={s.streep} /></View>
                </View>
              </>
            )}
          </View>
        </View>

        <View style={s.voet} fixed>
          <Text style={s.voetTekst}>{pdfTekst(`${o.bedrijf} - Hengelo - 06-13500083 - info@kernkozijnen.nl - www.kernkozijnen.nl`)}</Text>
          <Text style={s.voetTekst} render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} van ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
