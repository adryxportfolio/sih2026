/**
 * Publish study material.
 *
 * An administrator picks the material — a file (PDF, slides, document, video)
 * or a YouTube / web link — then a department, or every department, and the
 * officers inside it who should receive it. Everyone starts ticked, because
 * the usual intent is "the whole directorate", and the exceptions (the two
 * officers on deputation, the one who already did this course) are unticked.
 */
import React, { useEffect, useMemo, useState } from "react";
import { View, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as DocumentPicker from "expo-document-picker";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme, space, radius, type as typo } from "../src/theme";
import { Screen, Txt, Row, Card, Button, Chip, IconButton, Divider, Badge } from "../src/components/ui";
import { useSession } from "../src/store/session";
import { notify } from "../src/lib/dialog";
import {
  loadDirectory, publishMaterial, youtubeIdFrom, kindFromFile, formatBytes,
  MAX_UPLOAD_BYTES, KIND_META, type PickedFile, type Department, type MaterialKind,
} from "../src/lib/materials";

type Source = "file" | "youtube" | "link";
const ALL = "__all__";

const FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "video/*",
];

export default function PublishMaterial() {
  const t = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isDemo } = useSession();

  const [source, setSource] = useState<Source>("file");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deptId, setDeptId] = useState<string>(ALL);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const directory = useQuery({
    queryKey: ["directory", isDemo],
    queryFn: () => loadDirectory(isDemo),
  });
  const departments: Department[] = directory.data ?? [];

  // Everyone in scope is ticked whenever the scope changes.
  const inScope = useMemo(
    () => (deptId === ALL ? departments : departments.filter((d) => d.id === deptId)),
    [departments, deptId],
  );
  useEffect(() => {
    setSelected(new Set(inScope.flatMap((d) => d.people.map((p) => p.user_id))));
  }, [inScope]);

  const scopeCount = inScope.reduce((n, d) => n + d.people.length, 0);
  const youtubeId = source === "youtube" ? youtubeIdFrom(url) : null;

  const kind: MaterialKind = source === "youtube" ? "youtube"
    : source === "link" ? "link"
    : file ? kindFromFile(file.name, file.mimeType) : "document";

  const pick = async () => {
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: FILE_TYPES, copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0] as DocumentPicker.DocumentPickerAsset & { file?: Blob };
      if (a.size && a.size > MAX_UPLOAD_BYTES) {
        setError(`That file is ${formatBytes(a.size)}. Files up to ${formatBytes(MAX_UPLOAD_BYTES)} can be uploaded — publish longer videos as a YouTube link.`);
        return;
      }
      setFile({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size, file: a.file ?? null });
      if (!title.trim()) setTitle(a.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const setDepartmentAll = (d: Department, on: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    d.people.forEach((p) => (on ? next.add(p.user_id) : next.delete(p.user_id)));
    return next;
  });

  // Opened from a deep link there is nothing to go back to.
  const close = () => (router.canGoBack() ? router.back() : router.replace("/(admin)/materials"));

  const ready =
    title.trim().length > 1 &&
    selected.size > 0 &&
    (source === "file" ? !!file : source === "youtube" ? !!youtubeId : /^https?:\/\/\S+\.\S+/i.test(url.trim()));

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const dept = departments.find((d) => d.id === deptId);
      const r = await publishMaterial(isDemo, {
        title, description, kind,
        url: source === "file" ? undefined : url.trim(),
        file: source === "file" ? file ?? undefined : undefined,
        audience: deptId === ALL ? "all_departments" : "department",
        departmentId: deptId === ALL ? null : deptId,
        departmentName: dept?.name ?? "All departments",
        userIds: [...selected],
      });
      await queryClient.invalidateQueries({ queryKey: ["materials"] });
      notify("Published", `"${title.trim()}" is now in the Library of ${r.assigned} officer${r.assigned === 1 ? "" : "s"}.`);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    minHeight: 50, borderRadius: radius.md, backgroundColor: t.color.bgSunken,
    borderWidth: StyleSheet.hairlineWidth, borderColor: t.color.border,
    paddingHorizontal: space.base, paddingVertical: 12, color: t.color.text, ...typo.body,
  };

  const q = search.trim().toLowerCase();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.color.bg }} edges={["top", "bottom"]}>
      <Row justify="space-between" style={{ paddingHorizontal: space.base, paddingVertical: space.sm }}>
        <Row gap={space.md} style={{ flex: 1 }}>
          <IconButton icon="close" tone="plain" onPress={close} accessibilityLabel="Close" />
          <View>
            <Txt variant="h3">Publish material</Txt>
            <Txt variant="overline" tone="subtle">TO A DEPARTMENT</Txt>
          </View>
        </Row>
      </Row>
      <Divider />

      <Screen edges={[]} contentStyle={{ paddingTop: space.base, paddingBottom: 140 }}>
        {/* 1 · What */}
        <Txt variant="overline" tone="muted" style={{ marginBottom: space.sm }}>1 · MATERIAL</Txt>
        <Row gap={space.sm} wrap style={{ marginBottom: space.md }}>
          <Chip label="File" icon="document-attach-outline" selected={source === "file"} onPress={() => setSource("file")} />
          <Chip label="YouTube" icon="logo-youtube" selected={source === "youtube"} onPress={() => setSource("youtube")} />
          <Chip label="Link" icon="link-outline" selected={source === "link"} onPress={() => setSource("link")} />
        </Row>

        {source === "file" ? (
          <Card level={1} onPress={pick} style={{ borderStyle: "dashed", borderWidth: 1.5, borderColor: t.color.borderStrong }}>
            <Row gap={space.md}>
              <View style={{
                width: 46, height: 46, borderRadius: radius.md,
                backgroundColor: file ? t.color.primary : t.color.bgSunken,
                alignItems: "center", justifyContent: "center",
              }}>
                <Ionicons
                  name={(file ? KIND_META[kind].icon : "cloud-upload-outline") as keyof typeof Ionicons.glyphMap}
                  size={22} color={file ? t.color.onPrimary : t.color.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="bodyMd" numberOfLines={1}>{file ? file.name : "Choose a file"}</Txt>
                <Txt variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  {file
                    ? `${KIND_META[kind].label}${file.size ? ` · ${formatBytes(file.size)}` : ""} · tap to change`
                    : `PDF, PPTX, DOCX or video · up to ${formatBytes(MAX_UPLOAD_BYTES)}`}
                </Txt>
              </View>
            </Row>
          </Card>
        ) : (
          <View>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder={source === "youtube" ? "https://www.youtube.com/watch?v=…" : "https://…"}
              placeholderTextColor={t.color.textSubtle}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={inputStyle}
            />
            {source === "youtube" && url.trim() && !youtubeId ? (
              <Txt variant="caption" tone="muted" style={{ marginTop: 6 }}>
                Paste a youtube.com or youtu.be link to a single video.
              </Txt>
            ) : null}
            {youtubeId ? (
              <View style={{ marginTop: space.md, borderRadius: radius.md, overflow: "hidden", backgroundColor: "#000000" }}>
                <Image source={{ uri: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` }}
                       style={{ width: "100%", aspectRatio: 16 / 9 }} contentFit="cover" />
              </View>
            ) : null}
          </View>
        )}

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title officers will see"
          placeholderTextColor={t.color.textSubtle}
          style={[inputStyle, { marginTop: space.md }]}
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Why they should read it (optional)"
          placeholderTextColor={t.color.textSubtle}
          multiline
          style={[inputStyle, { marginTop: space.sm, minHeight: 72, textAlignVertical: "top" }]}
        />

        {/* 2 · Who */}
        <Txt variant="overline" tone="muted" style={{ marginTop: space.xl, marginBottom: space.sm }}>2 · DEPARTMENT</Txt>
        {directory.isLoading ? <ActivityIndicator color={t.color.text} style={{ alignSelf: "flex-start" }} /> : null}
        {directory.error ? (
          <Txt variant="small" tone="muted">Could not load departments: {(directory.error as Error).message}</Txt>
        ) : null}
        {departments.length ? (
          <View style={{ gap: space.sm }}>
            <DeptOption label="All departments" count={departments.reduce((n, d) => n + d.people.length, 0)}
                        selected={deptId === ALL} onPress={() => setDeptId(ALL)} icon="globe-outline" />
            {departments.map((d) => (
              <DeptOption key={d.id} label={d.name} count={d.people.length}
                          selected={deptId === d.id} onPress={() => setDeptId(d.id)} icon="business-outline" />
            ))}
          </View>
        ) : null}

        {/* 3 · Officers */}
        {scopeCount ? (
          <>
            <Row justify="space-between" style={{ marginTop: space.xl, marginBottom: space.sm }}>
              <Txt variant="overline" tone="muted">3 · OFFICERS</Txt>
              <Txt variant="caption">{selected.size} of {scopeCount} selected</Txt>
            </Row>
            {scopeCount > 8 ? (
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Find by name or employee ID"
                placeholderTextColor={t.color.textSubtle}
                style={[inputStyle, { marginBottom: space.md }]}
              />
            ) : null}
            <View style={{ gap: space.md }}>
              {inScope.map((d) => {
                const people = d.people.filter((p) => !q
                  || p.full_name.toLowerCase().includes(q)
                  || (p.employee_code ?? "").toLowerCase().includes(q));
                if (!people.length) return null;
                const allOn = d.people.every((p) => selected.has(p.user_id));
                return (
                  <Card key={d.id} level={1} padded={false}>
                    <Pressable
                      onPress={() => setDepartmentAll(d, !allOn)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: allOn }}
                      style={{ flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, backgroundColor: t.color.bgSunken }}
                    >
                      <Ionicons name={allOn ? "checkbox" : "square-outline"} size={22} color={t.color.text} />
                      <View style={{ flex: 1 }}>
                        <Txt variant="bodyMd" numberOfLines={2}>{d.name}</Txt>
                        <Txt variant="caption" tone="muted">
                          {d.people.filter((p) => selected.has(p.user_id)).length} of {d.people.length} · {allOn ? "tap to clear" : "tap to select all"}
                        </Txt>
                      </View>
                    </Pressable>
                    {people.map((p) => {
                      const on = selected.has(p.user_id);
                      return (
                        <Pressable
                          key={p.user_id}
                          onPress={() => toggle(p.user_id)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: on }}
                          accessibilityLabel={p.full_name}
                          style={{
                            flexDirection: "row", alignItems: "center", gap: space.md,
                            paddingVertical: space.md, paddingHorizontal: space.md,
                            borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.border,
                          }}
                        >
                          <Ionicons name={on ? "checkbox" : "square-outline"} size={22}
                                    color={on ? t.color.text : t.color.textSubtle} />
                          <View style={{ flex: 1 }}>
                            <Txt variant="body" tone={on ? "default" : "muted"}>{p.full_name}</Txt>
                            <Txt variant="caption" tone="subtle">
                              {[p.employee_code, p.designation].filter(Boolean).join(" · ")}
                            </Txt>
                          </View>
                        </Pressable>
                      );
                    })}
                  </Card>
                );
              })}
            </View>
          </>
        ) : directory.data ? (
          <Card level={1} style={{ marginTop: space.lg }}>
            <Txt variant="small" tone="muted">No officers in this department yet.</Txt>
          </Card>
        ) : null}

        {isDemo ? (
          <Row style={{ marginTop: space.lg }}>
            <Badge label="DEMO — SAVED ON THIS DEVICE" tone="neutral" size="sm" icon="flask-outline" />
          </Row>
        ) : null}
      </Screen>

      {/* Sticky action */}
      <View style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        padding: space.base, paddingBottom: space.xl,
        backgroundColor: t.color.bgElevated,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.color.border,
      }}>
        {error ? (
          <Row gap={space.sm} align="flex-start" style={{ marginBottom: space.md }}>
            <Ionicons name="alert-circle" size={16} color={t.color.danger} style={{ marginTop: 1 }} />
            <Txt variant="small" tone="danger" style={{ flex: 1 }}>{error}</Txt>
          </Row>
        ) : null}
        <Button
          label={busy ? (source === "file" ? "Uploading…" : "Publishing…")
            : `Publish to ${selected.size} officer${selected.size === 1 ? "" : "s"}`}
          icon="send"
          full size="lg"
          loading={busy}
          disabled={!ready}
          onPress={submit}
        />
      </View>
    </SafeAreaView>
  );
}

function DeptOption({
  label, count, selected, onPress, icon,
}: { label: string; count: number; selected: boolean; onPress: () => void; icon: keyof typeof Ionicons.glyphMap }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{
        flexDirection: "row", alignItems: "center", gap: space.md,
        padding: space.md, borderRadius: radius.md,
        backgroundColor: selected ? t.color.primary : t.color.bgElevated,
        borderWidth: StyleSheet.hairlineWidth, borderColor: selected ? t.color.primary : t.color.border,
      }}
    >
      <Ionicons name={icon} size={18} color={selected ? t.color.onPrimary : t.color.text} />
      <Txt variant="body" style={{ flex: 1, color: selected ? t.color.onPrimary : t.color.text }} numberOfLines={2}>
        {label}
      </Txt>
      <Txt variant="caption" style={{ color: selected ? t.color.onPrimary : t.color.textMuted }}>
        {count} {count === 1 ? "officer" : "officers"}
      </Txt>
    </Pressable>
  );
}
