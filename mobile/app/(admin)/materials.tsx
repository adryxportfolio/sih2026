/**
 * Published study material.
 *
 * What the administrator has put in front of officers, who it went to and how
 * many have actually opened it — because publishing a handbook is not the same
 * as anyone reading it, and the gap between the two is what a training cell
 * needs to see.
 */
import React, { useState } from "react";
import { View, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { formatDistanceToNowStrict } from "date-fns";
import { useTheme, space, radius, elevation } from "../../src/theme";
import { Screen, Txt, Row, Card, Badge, EmptyState, Loading, ProgressBar } from "../../src/components/ui";
import { Squish } from "../../src/components/motion";
import { useSession } from "../../src/store/session";
import { listPublished, KIND_META } from "../../src/lib/materials";

export default function Materials() {
  const t = useTheme();
  const router = useRouter();
  const { isDemo } = useSession();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["materials", "published", isDemo],
    queryFn: () => listPublished(isDemo),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const publish = () => router.push("/publish-material");

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.color.text} />}>
      <Row justify="space-between" align="flex-start" style={{ marginTop: space.sm, marginBottom: space.base }}>
        <View style={{ flex: 1 }}>
          <Txt variant="overline" tone="muted">STUDY MATERIAL</Txt>
          <Txt variant="h1" style={{ marginTop: 2 }}>Materials</Txt>
        </View>
        <Squish onPress={publish} haptic="medium">
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 6,
            height: 40, paddingHorizontal: space.base, borderRadius: radius.pill,
            backgroundColor: t.color.bgInverse, ...elevation(2, t.color.shadow),
          }}>
            <Ionicons name="cloud-upload" size={15} color={t.color.textInverse} />
            <Txt variant="caption" style={{ color: t.color.textInverse }}>PUBLISH</Txt>
          </View>
        </Squish>
      </Row>

      <Card level={1} tone="sunken" onPress={publish} style={{ marginBottom: space.lg }}>
        <Row gap={space.md}>
          <View style={{
            width: 44, height: 44, borderRadius: radius.md, backgroundColor: t.color.primary,
            alignItems: "center", justifyContent: "center",
          }}>
            <Ionicons name="add" size={22} color={t.color.onPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="bodyMd">Publish to a department</Txt>
            <Txt variant="caption" tone="muted" style={{ marginTop: 2 }}>
              PDF, slides, documents, video or a YouTube link — choose who receives it
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.color.textSubtle} />
        </Row>
      </Card>

      {isLoading ? <Loading label="Loading materials…" /> : null}

      {error ? (
        <Card level={1}>
          <Txt variant="bodyMd">Could not load materials</Txt>
          <Txt variant="caption" tone="muted" style={{ marginTop: 3 }}>{(error as Error).message}</Txt>
        </Card>
      ) : null}

      {data && !data.length ? (
        <EmptyState
          icon="library-outline"
          title="Nothing published yet"
          body="Material you publish appears in each chosen officer's Library, and here you can see who has opened it."
          actionLabel="Publish material"
          onAction={publish}
        />
      ) : null}

      <View style={{ gap: space.md }}>
        {(data ?? []).map((m) => {
          const meta = KIND_META[m.kind] ?? KIND_META.document;
          const reach = m.assigned ? m.opened / m.assigned : 0;
          return (
            <Card key={m.id} level={1}>
              <Row gap={space.md} align="flex-start">
                <View style={{
                  width: 42, height: 42, borderRadius: radius.sm, backgroundColor: t.color.bgSunken,
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={20} color={t.color.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="bodyMd" numberOfLines={2}>{m.title}</Txt>
                  <Row gap={space.sm} wrap style={{ marginTop: 4 }}>
                    <Txt variant="overline" tone="subtle">{meta.label}</Txt>
                    <Txt variant="overline" tone="subtle">
                      · {formatDistanceToNowStrict(new Date(m.created_at), { addSuffix: true }).toUpperCase()}
                    </Txt>
                  </Row>
                </View>
              </Row>
              {m.description ? (
                <Txt variant="small" tone="muted" style={{ marginTop: space.sm }}>{m.description}</Txt>
              ) : null}
              <Row gap={space.sm} wrap style={{ marginTop: space.md }}>
                <Badge label={m.published_to} tone="neutral" size="sm"
                       icon={m.audience === "all_departments" ? "globe-outline" : "business-outline"} />
                <Badge label={`${m.assigned} officer${m.assigned === 1 ? "" : "s"}`} tone="neutral" size="sm" icon="people-outline" />
              </Row>
              <Row justify="space-between" style={{ marginTop: space.md, marginBottom: 6 }}>
                <Txt variant="caption" tone="muted">Opened</Txt>
                <Txt variant="caption">{m.opened} of {m.assigned}</Txt>
              </Row>
              <ProgressBar value={reach} height={6} />
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
