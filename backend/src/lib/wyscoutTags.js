/**
 * Wyscout event tag dictionary.
 *
 * Source: canonical mapping used by socceraction (ML-KULeuven), the standard
 * open-source library for working with Wyscout/StatsBomb/Opta event data.
 * https://github.com/ML-KULeuven/socceraction
 *
 * Each event in the raw data has a `tags` array like [{id: 1801}, {id: 401}].
 * This maps each numeric id to a human-readable label.
 */

const WYSCOUT_TAGS = {
  101: "goal",
  102: "own_goal",
  301: "assist",
  302: "key_pass",
  1901: "counter_attack",
  401: "left_foot",
  402: "right_foot",
  403: "head/body",
  1101: "direct",
  1102: "indirect",
  2001: "dangerous_ball_lost",
  2101: "blocked",
  801: "high",
  802: "low",
  1401: "interception",
  1501: "clearance",
  201: "opportunity",
  1301: "feint",
  1302: "missed_ball",
  501: "free_space_right",
  502: "free_space_left",
  503: "take_on_left",
  504: "take_on_right",
  1601: "sliding_tackle",
  601: "anticipated",
  602: "anticipation",
  1701: "red_card",
  1702: "yellow_card",
  1703: "second_yellow_card",
  // Shot placement zones (where on/around the goal the shot was directed)
  1201: "position_goal_low_center",
  1202: "position_goal_low_right",
  1203: "position_goal_center",
  1205: "position_goal_low_left",
  1206: "position_goal_center_left",
  1208: "position_goal_high_center",
  1209: "position_goal_high_left",
  1210: "position_goal_high_right",
  1211: "position_out_low_right",
  1212: "position_out_center_left",
  1213: "position_out_low_left",
  1214: "position_out_center_right",
  1215: "position_out_high_center",
  1216: "position_out_high_left",
  1217: "position_out_high_right",
  1218: "position_post_low_right",
  1219: "position_post_center_left",
  1220: "position_post_low_left",
  1221: "position_post_center_right",
  1222: "position_post_high_center",
  1223: "position_post_high_right",
  1224: "position_post_high_left",
  901: "through",
  1001: "fairplay",
  1801: "accurate",
  1802: "not_accurate",
  701: "lost",
  702: "neutral",
  703: "won",
};

function decodeTags(tags) {
  return tags.map((t) => WYSCOUT_TAGS[t.id] || `unknown_${t.id}`);
}

function hasTag(tags, tagId) {
  return tags.some((t) => t.id === tagId);
}

module.exports = { WYSCOUT_TAGS, decodeTags, hasTag };
