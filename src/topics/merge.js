"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const plugins = require("../plugins");
const posts = require("../posts");
module.exports = function (Topics) {
    Topics.merge = (tids, uid, options) => __awaiter(this, void 0, void 0, function* () {
        options = options || {};
        const topicsData = yield Topics.getTopicsFields(tids, ['scheduled']);
        if (topicsData.some(t => t.scheduled)) {
            throw new Error('[[error:cant-merge-scheduled]]');
        }
        const oldestTid = Topics.findOldestTopic(tids);
        let mergeIntoTid = oldestTid;
        if (options.mainTid) {
            mergeIntoTid = options.mainTid;
        }
        else if (options.newTopicTitle) {
            mergeIntoTid = yield Topics.createNewTopic(options.newTopicTitle, oldestTid);
        }
        const otherTids = tids.sort((a, b) => a - b)
            .filter(tid => tid && tid !== mergeIntoTid);
        for (const tid of otherTids) {
            /* eslint-disable no-await-in-loop */
            const pids = yield Topics.getPids(tid);
            for (const pid of pids) {
                yield Topics.movePostToTopic(uid, pid, mergeIntoTid);
            }
            yield Topics.setTopicField(tid, 'mainPid', 0);
            yield Topics.delete(tid, uid);
            yield Topics.setTopicFields(tid, {
                mergeIntoTid: mergeIntoTid,
                mergerUid: uid,
                mergedTimestamp: Date.now(),
            });
        }
        yield Promise.all([
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            posts.updateQueuedPostsTopic(mergeIntoTid, otherTids),
            Topics.updateViewCount(mergeIntoTid, tids),
        ]);
        yield plugins.hooks.fire('action:topic.merge', {
            uid: uid,
            tids: tids,
            mergeIntoTid: mergeIntoTid,
            otherTids: otherTids,
        });
        return mergeIntoTid;
    });
    Topics.createNewTopic = (title, oldestTid) => __awaiter(this, void 0, void 0, function* () {
        const topicData = yield Topics.getTopicFields(oldestTid, ['uid', 'cid']);
        const params = {
            uid: topicData.uid,
            cid: topicData.cid,
            title: title,
        };
        const result = yield plugins.hooks.fire('filter:topic.mergeCreateNewTopic', {
            oldestTid: oldestTid,
            params: params,
        });
        const tid = yield Topics.create(result.params);
        return tid;
    });
    Topics.updateViewCount = (mergeIntoTid, tids) => __awaiter(this, void 0, void 0, function* () {
        const topicData = yield Topics.getTopicsFields(tids, ['viewcount']);
        const totalViewCount = topicData.reduce((count, topic) => count + parseInt(topic.viewcount, 10), 0);
        yield Topics.setTopicField(mergeIntoTid, 'viewcount', totalViewCount);
    });
    Topics.findOldestTopic = function (tids) {
        return Math.min.apply(0, tids);
    };
};
