define(function(require, exports, module) {

    var ChunkUpload = require('edusoho.chunkupload');
    var Notify = require('common/bootstrap-notify');
    var UploadProgressBar = require('edusoho.uploadProgressBar');
    var VideoQualitySwitcher = require('../widget/video-quality-switcher');
    var Widget = require('widget');

    var BatchAttachmentsUploader = Widget.extend({
            attrs: {

            },

            events: {
            },

            setup: function() {
               this.run();
            },

            run: function() {
                var fileExts = $("#selectFiles").data("fileExts");
                var chunkUpload = new ChunkUpload({
                    element: '#selectFiles',
                    file_types : fileExts,
                    file_size_limit : "2 GB",
                    uploadOnSelected: false
                });
                var switcher = null;
                if ($('.quality-switcher').length > 0) {
                    switcher = new VideoQualitySwitcher({
                        element: '.quality-switcher'
                    });
                }
                var self = this;
                chunkUpload.on("upload_start_handler", function(file){
                    self.uploadStart(file, this, switcher);
                });

                chunkUpload.on("fileSelected", this.fileSelected);

                chunkUpload.on("upload_progress_handler", function(file, bytesLoaded, bytesTotal, fileIndex) {
                    var percentage = Math.ceil((bytesLoaded / bytesTotal) * 100);
                    $("div[role='progressbar']","#fileProgressBar"+fileIndex).text(Translator.trans('上传中'));
                    var progressbar = $("#fileProgressBar"+fileIndex).data("progressbar");
                    if(percentage > progressbar.get("percentage")){
                        progressbar.setProgress(percentage);
                    }
                });

                chunkUpload.on("upload_success_handler", function(file, serverData, fileIndex) {
                    serverData = $.parseJSON(serverData);
                    var videoInfoUrl = this.element.data("getVideoInfo");
                    var audioInfoUrl = this.element.data("getAudioInfo");
                    var videoFileExts = "*.mp4;*.avi;*.flv;*.wmv;*.mov;*.m4v";
                    if(videoInfoUrl && videoFileExts.indexOf(self.getFileExt(file.name))>-1){
                        $.ajax({
                            url: videoInfoUrl,
                            data: {key: serverData.key},
                            async: false,
                            success: function(data){
                                serverData.length = data;
                                serverData.lazyConvert = 1;
                            }
                        });
                    } else if(audioInfoUrl && '*.mp3'.indexOf(self.getFileExt(file.name))>-1){
                        $.ajax({
                            url: audioInfoUrl,
                            data: {key: serverData.key},
                            async: false,
                            success: function(data){
                                serverData.length = data;
                            }
                        });
                    } else {
                        serverData.mimeType=file.type;
                    }

                    if('*.ppt;*.pptx;*.doc;*.docx;*.pdf'.indexOf(self.getFileExt(file.name))>-1){

                        serverData.lazyConvert = 1;
                    } 

                    if (this.element.data('callback')) {
                        var url = this.element.data('callback');
                        if(serverData.lazyConvert == 1){
                            url = url+'&lazyConvert=1';
                        }
                        var that = this;
                        $.post(url, serverData, function(response) {
                            $("div[role='progressbar']", "#fileProgressBar"+fileIndex).text(Translator.trans('完成'));
                            var targetId = that.element.data('targetId');
                            self.get("editor").insertHtml(Translator.trans('附件:')  +"<a href='/course/"+targetId+"/manage/question/attachment/"+response.id+"/download'>" + file.name + "</a>");
                        }, 'json');
                    }
                });
                
                chunkUpload.on("allComplete", function(){
                    self.stopUpload(chunkUpload);
                });

                $("#btn_upload").on('click', function(){
                    var fileQueueLength = chunkUpload.get("fileQueue").length;
                    if(fileQueueLength==0){
                        Notify.danger(Translator.trans('请先添加待上传文件！'));
                        return ;
                    }
                    var uploadButton = $("#btn_upload");
                    $("#selectFiles").prop("disabled",true);
                    chunkUpload.trigger("upload", chunkUpload.get("currentFileIndex"));
                    uploadButton.unbind("click");
                    uploadButton.find("span").text(Translator.trans('暂停'));
                    uploadButton.on("click", function(){
                        self.stopUpload(chunkUpload);
                    });
                });

                $("#modal").on("hide.bs.modal", function(){
                    var length = chunkUpload.get("fileQueue").length;
                    var currentFileIndex = chunkUpload.get("currentFileIndex");
                    
                    if(length != currentFileIndex){
                        if(!confirm(Translator.trans('当前正在上传的文件将停止上传，确定关闭？'))){
                            return false;
                        }
                    }
                    
                    chunkUpload.destroy();

                     // window.location.reload();
                });

            },

            getFileSize : function(size)  {
                return (size / (1024 * 1024)).toFixed(2) + "MB";
            },

            stopUpload : function(chunkUpload){
                var uploadButton = $("#btn_upload");
                uploadButton.find("span").text(Translator.trans('上传'));
                chunkUpload.stopUpload();
                uploadButton.unbind("click");
                $("#selectFiles").prop("disabled",false);
                var that = this;
                uploadButton.on("click", function(){
                    that.continueUpload(chunkUpload);
                });
            },

            continueUpload: function(chunkUpload){
                var uploadButton = $("#btn_upload");
                uploadButton.find("span").text(Translator.trans('暂停'));
                chunkUpload.continueUpload();
                uploadButton.unbind("click");
                $("#selectFiles").prop("disabled",true);
                var that = this;
                uploadButton.on("click", function(){
                    that.stopUpload(chunkUpload);
                });
            },

            getFileType: function(fileSuffix) {
                var fileSuffixs = {
                    "video": "*.mp4;*.avi;*.flv;*.wmv;*.mov;*.m4v;",
                    "audio": "*.mp3",
                    "document": "*.doc;*.docx;*.pdf",
                    "ppt": "*.ppt;*.pptx",
                    "flash": "*.swf",
                    "rar":"*.rar"
                };

                for(var key in fileSuffixs){
                    if(fileSuffixs[key].lastIndexOf(fileSuffix)>=0){
                        return key;
                    }
                }
                return "other";
            },

            uploadStart: function(file, self, switcher) {
                var data = {};
                var targetType = self.element.data('targetType');
                var uploadMode = self.element.data('uploadMode');
                var hlsEncrypted = self.element.data('hlsEncrypted');
                var fileSuffix = file.name.substr(file.name.lastIndexOf(".")+1).toLowerCase();
                var fileType = this.getFileType(fileSuffix);
                if ((targetType == 'coursequestion') && uploadMode == 'cloud') {
                    if ($.inArray(fileType, ['audio','flash']) >= 0) {
                        data.convertor = '';
                    } else if ($.inArray(fileType, ['ppt','document']) >= 0) {
                        data.convertor = fileType;
                        data.lazyConvert = 1;
                    } else if(fileType == 'video'){
                        if (switcher) {
                            data.videoQuality = switcher.get('videoQuality');
                            data.audioQuality = switcher.get('audioQuality');
                            if (hlsEncrypted) {
                                data.convertor = 'HLSEncryptedVideo';
                                data.lazyConvert = 1;
                            } else {
                                data.convertor = 'HLSVideo';
                                data.lazyConvert = 1;
                            }
                        }
                    }
                }
                
                $.ajax({
                    url: self.element.data('paramsUrl'),
                    async: false,
                    dataType: 'json',
                    data: data, 
                    cache: false,
                    success: function(response, status, jqXHR) {
                        var paramsKey = {};
                        paramsKey.data=data;
                        paramsKey.targetType=targetType;
                        paramsKey.targetId=self.element.data('targetId');
                        response.postParams.paramsKey = JSON.stringify(paramsKey);

                        self.setUploadURL(response.url);
                        self.setPostParams(response.postParams);


                    },
                    error: function(jqXHR, status, error) {
                        Notify.danger(Translator.trans('请求上传授权码失败！'));
                    }
                });
            },

            fileSelected: function(files){
                var fileQueue = this.get('fileQueue');
                var startLength=0;
                if(fileQueue) {
                    startLength = fileQueue.length;
                }
                for (var i = 0; i < files.length; i++) {
                    var file = files[i];
                    var index = (i+startLength);
                    var tr = "<tr>";
                    tr += "<td>"+file.name+"</td>";
                    tr += "<td>"+this.getFileSize(file.size)+"</td>";
                    tr += "<td id='file_"+index+"'>";
                    tr += "<div class='progress' id='fileProgressBar"+index+"'>";
                    tr += "<div class='progress-bar' role='progressbar' aria-valuenow='0' aria-valuemin='0' aria-valuemax='100' style='width: 0%; text-align:left;'>"+Translator.trans('未开始')+"</div>";
                    tr += "</div>";
                    tr += "</td>";
                    tr += "</tr>";
                    $("#fileList table tbody").append($(tr));
                    var progressbar = new UploadProgressBar({
                        element: "#fileProgressBar"+index
                    });
                    $("#fileProgressBar"+index).data("progressbar",progressbar);
                };
            },

            getFileExt: function(str) { 
                var d=/\.[^\.]+$/.exec(str); 
                return d[0].toLowerCase(); 
            }


    });

    module.exports = BatchAttachmentsUploader;

});